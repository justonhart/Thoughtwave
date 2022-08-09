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
            const isAKeeperRoom = isKeeperRoom(this.memory.assignment);
            if (!this.memory.destination) {
                this.memory.destination = this.findNextMiningPos(isAKeeperRoom);
            }

            let targetPos = posFromMem(this.memory.destination);
            if (targetPos) {
                if (!this.pos.isEqualTo(targetPos)) {
                    this.travelTo(targetPos);
                } else {
                    let container: StructureContainer = targetPos
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;

                    if (!container && this.store.energy) {
                        let constructionSite = targetPos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                        if (!constructionSite) {
                            this.room.createConstructionSite(targetPos, STRUCTURE_CONTAINER);
                        } else if (this.store.energy) {
                            this.build(constructionSite);
                            return;
                        }
                    } else if (this.store.energy && container.hits < container.hitsMax) {
                        this.repair(container);
                    } else if (container?.store.getFreeCapacity() === 0) {
                        delete this.memory.destination;
                    } else {
                        const sourceId = Object.entries(Memory.remoteData[this.memory.assignment].miningPositions).find(
                            ([sourceId, miningPos]) => this.memory.destination === miningPos
                        )?.[0];
                        if (sourceId) {
                            this.harvest(Game.getObjectById(sourceId));
                        } else {
                            delete this.memory.destination;
                        }
                    }

                    if (isAKeeperRoom && container && this.destinationSpawningKeeper()) {
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
                const lair = Game.getObjectById(lairId[1]) as StructureKeeperLair;
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

    private destinationSpawningKeeper(): boolean {
        const lair = Object.entries(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).find(
            ([sourceId, lairId]) => this.pos.getRangeTo(Game.getObjectById(sourceId)) <= 5
        );
        const lairInRange = Game.getObjectById(lair[1]) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 20;
    }
}
