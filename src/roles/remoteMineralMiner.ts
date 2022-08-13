import { isKeeperRoom, posFromMem } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class RemoteMineralMiner extends WaveCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.memory.assignment]) {
            const isAKeeperRoom = isKeeperRoom(this.memory.assignment);
            if (!this.memory.destination) {
                this.memory.destination = this.findTarget();
            }

            let targetPos = posFromMem(this.memory.destination);
            if (targetPos) {
                if (!this.pos.isEqualTo(targetPos)) {
                    if (isAKeeperRoom && this.pos.getRangeTo(targetPos) < 9 && (this.hasKeeper(targetPos) || this.destinationSpawningKeeper())) {
                        this.say('🚨KEEPER🚨');
                        delete this.memory.destination;
                        return;
                    }
                    this.travelTo(targetPos);
                } else if (this.store.getFreeCapacity() >= this.getActiveBodyparts(WORK)) {
                    if (isAKeeperRoom && (this.hasKeeper(targetPos) || this.destinationSpawningKeeper())) {
                        this.say('🚨KEEPER🚨');
                        delete this.memory.destination;
                        return;
                    }
                    const mineral = Game.getObjectById(this.getMineralIdByMiningPos(this.memory.destination)) as Mineral;
                    const result = this.harvest(mineral);

                    // Finished mining mineral
                    if (result === ERR_NOT_ENOUGH_RESOURCES) {
                        Memory.remoteData[this.memory.assignment].mineralAvailableAt = Game.time + mineral.ticksToRegeneration;
                        this.suicide();
                    }
                } else {
                    this.storeCargo();
                    if (this.ticksToLive < 200) {
                        this.suicide(); // Can be changed to recycle once implemented
                    }
                }
            } else if (isAKeeperRoom) {
                //travel out of danger-zone
                const lairPositions = Object.values(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).map((lairId) => {
                    return { pos: Game.getObjectById(lairId).pos, range: 0 };
                });
                this.travelTo(lairPositions.pop(), { range: 7, flee: true, goals: lairPositions }); // Travel back to home room
            }
        } else {
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
        if (!nextPos) {
            return undefined;
        }
        return nextPos[1];
    }

    private getMineralIdByMiningPos(pos: string): Id<Mineral> {
        return Object.entries(Memory.remoteData[this.memory.assignment].miningPositions).find(
            ([sourceId, miningPos]) => this.memory.destination === miningPos
        )?.[0] as Id<Mineral>;
    }

    private destinationSpawningKeeper(): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.getMineralIdByMiningPos(this.memory.destination)];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 16;
    }

    private hasKeeper(target: RoomPosition): boolean {
        return !!target.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }
}
