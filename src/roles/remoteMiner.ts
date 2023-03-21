import { isKeeperRoom } from '../modules/data';
import { posFromMem } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.memory.assignment]) {
            // Remove left over extensions (usually from strongholds) when these block creation of new extensions
            if (this.memory.targetId) {
                const structure = Game.getObjectById(this.memory.targetId) as StructureContainer;
                if (!structure) {
                    delete this.memory.targetId;
                } else {
                    const dismantleStatus = this.dismantle(structure);
                    if (dismantleStatus === ERR_NOT_IN_RANGE) {
                        this.travelTo(structure);
                    }
                    return;
                }
            }

            const isAKeeperRoom = isKeeperRoom(this.memory.assignment);
            if (!this.memory.destination) {
                this.memory.destination = this.findNextMiningPos(isAKeeperRoom);
            }

            let targetPos = posFromMem(this.memory.destination);
            if (targetPos) {
                if (!this.pos.isEqualTo(targetPos)) {
                    if (isAKeeperRoom && this.destinationSpawningKeeper(this.memory.destination)) {
                        delete this.memory.destination;
                    } else {
                        this.travelTo(targetPos);
                    }
                } else {
                    let container: StructureContainer = targetPos
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;

                    if (!container && this.store.energy) {
                        let constructionSite = targetPos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                        if (!constructionSite) {
                            const result = this.room.createConstructionSite(targetPos, STRUCTURE_CONTAINER);
                            if (result === ERR_RCL_NOT_ENOUGH) {
                                // left over extensions from a stronghold
                                const structure = this.room
                                    .find(FIND_STRUCTURES, {
                                        filter: (s) =>
                                            s.structureType === STRUCTURE_CONTAINER &&
                                            !Object.keys(Memory.remoteData[this.memory.assignment]?.miningPositions)?.some(
                                                (sourceId) => s.id === sourceId
                                            ),
                                    })
                                    .shift();

                                if (structure) {
                                    this.memory.targetId = structure.id;
                                }
                            }
                        } else if (this.store.energy) {
                            this.build(constructionSite);
                            return;
                        }
                    } else if (this.store.energy && container.hits < container.hitsMax) {
                        this.repair(container);
                    } else if (container?.store.getFreeCapacity() === 0) {
                        delete this.memory.destination;
                    } else {
                        const source = Game.getObjectById(this.getSourceIdByMiningPos(this.memory.destination)) as Source;
                        if (source && source.energy) {
                            this.harvest(source);
                        } else {
                            delete this.memory.destination;
                        }
                    }

                    if (isAKeeperRoom && container && (this.destinationSpawningKeeper(this.memory.destination) || this.hasKeeper(targetPos))) {
                        this.say('🚨KEEPER🚨');
                        delete this.memory.destination;
                    }
                }
            } else if (isAKeeperRoom) {
                //travel out of danger-zone
                const lairPositions = Object.values(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).map((lairId) => {
                    return { pos: Game.getObjectById(lairId).pos, range: 0 };
                });
                this.travelTo(lairPositions.pop(), { range: 7, flee: true, goals: lairPositions }); // Travel back to home room
            } else {
                this.say('🚚 is SLOW!');
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findNextMiningPos(isKeeperRoom: boolean): string {
        const nextPos = Object.entries(Memory.remoteData[this.memory.assignment]?.miningPositions)?.find(([sourceId, miningPosString]) => {
            const pos = posFromMem(miningPosString);
            if (isKeeperRoom) {
                // LAIR
                const lairId = Memory.remoteData[this.memory.assignment]?.sourceKeeperLairs[sourceId];
                const lair = Game.getObjectById(lairId) as StructureKeeperLair;
                const keeperSpawning = lair?.ticksToSpawn < 100;
                if (keeperSpawning) {
                    return false;
                }

                // KEEPER
                const hasKeeper = !!pos.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
                if (hasKeeper) {
                    return false;
                }
            }

            // ACTIVE SOURCE
            const source = Game.getObjectById(sourceId) as Source;
            if (!source.energy) {
                return false;
            }

            // CONTAINER NOT FILLED
            const container: StructureContainer = pos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;

            return !(container?.store.getFreeCapacity() === 0);
        });
        if (!nextPos) {
            return undefined;
        }
        return nextPos[1];
    }

    private destinationSpawningKeeper(pos: string): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.getSourceIdByMiningPos(pos)];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 20;
    }

    private getSourceIdByMiningPos(pos: string): Id<Source> {
        return Object.entries(Memory.remoteData[this.memory.assignment].miningPositions).find(
            ([sourceId, miningPos]) => pos === miningPos
        )?.[0] as Id<Source>;
    }

    private hasKeeper(target: RoomPosition): boolean {
        return !!target.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }
}
