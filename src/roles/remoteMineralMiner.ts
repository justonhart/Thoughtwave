import { isKeeperRoom, posFromMem } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class RemoteMineralMiner extends WaveCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        // Store Cargo
        if (this.memory.destination && posFromMem(this.memory.destination).roomName === this.memory.room) {
            this.storeCargo();
            if (!this.store.getUsedCapacity()) {
                if (this.ticksToLive < 200) {
                    this.suicide(); // Can be changed to recycle once implemented
                    return;
                }
                delete this.memory.destination;
            }
        } else if (Game.rooms[this.memory.assignment]) {
            // Mining
            const isAKeeperRoom = isKeeperRoom(this.memory.assignment);
            if (!this.memory.destination) {
                this.memory.destination = this.findTarget();
            }

            let targetPos = posFromMem(this.memory.destination);
            if (targetPos) {
                if (!this.pos.isEqualTo(targetPos)) {
                    if (
                        isAKeeperRoom &&
                        this.pos.getRangeTo(targetPos) < 9 &&
                        (this.hasKeeper(targetPos) || this.destinationSpawningKeeper(this.memory.destination))
                    ) {
                        this.say('🚨KEEPER🚨');
                        delete this.memory.destination;
                    } else {
                        this.travelTo(targetPos);
                    }
                } else if (this.store.getFreeCapacity() >= this.getActiveBodyparts(WORK)) {
                    if (isAKeeperRoom && (this.hasKeeper(targetPos) || this.destinationSpawningKeeper(this.memory.destination))) {
                        this.say('🚨KEEPER🚨');
                        delete this.memory.destination;
                    } else {
                        const mineral = Game.getObjectById(this.getMineralIdByMiningPos(this.memory.destination)) as Mineral;
                        const result = this.harvest(mineral);

                        // Finished mining mineral
                        if (result === ERR_NOT_ENOUGH_RESOURCES) {
                            Memory.remoteData[this.memory.assignment].mineralAvailableAt = Game.time + mineral.ticksToRegeneration;
                            this.suicide();
                        }
                    }
                } else {
                    // store cargo
                    this.memory.destination = this.homeroom.storage.pos.toMemSafe();
                }

                //travel out of danger-zone
                if (!this.memory.destination && isAKeeperRoom) {
                    const lairPositions = Object.values(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).map((lairId) => {
                        return { pos: Game.getObjectById(lairId).pos, range: 0 };
                    });
                    this.travelTo(targetPos, { range: 7, flee: true, goals: lairPositions }); // Travel back to home room
                }
            }
        } else {
            // Go to assignment room
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findTarget(): string {
        const nextPos = Object.entries(Memory.remoteData[this.memory.assignment]?.miningPositions)?.find(([sourceId, miningPosString]) => {
            // ACTIVE SOURCE
            const source = Game.getObjectById(sourceId) as Mineral;
            if (!source.mineralType) {
                return false;
            }
            return true;
        });
        if (!nextPos || this.hasKeeper(posFromMem(nextPos[1]))) {
            return undefined;
        }
        return nextPos[1];
    }

    private getMineralIdByMiningPos(pos: string): Id<Mineral> {
        return Object.entries(Memory.remoteData[this.memory.assignment].miningPositions).find(
            ([sourceId, miningPos]) => pos === miningPos
        )?.[0] as Id<Mineral>;
    }

    private destinationSpawningKeeper(pos: string): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.getMineralIdByMiningPos(pos)];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 16;
    }

    private hasKeeper(target: RoomPosition): boolean {
        return !!target.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }
}
