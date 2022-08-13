import { WaveCreep } from '../virtualCreeps/waveCreep';

export class RemoteMineralMiner extends WaveCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            if (Game.rooms[this.memory.assignment] || this.travelToRoom(this.memory.assignment) === IN_ROOM) {
                // Find target is visibility exists
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }
        }
        if (target) {
            this.memory.currentTaskPriority = Priority.HIGH;
            if (target.structureType === 'spawn') {
                if (this.pos.isNearTo(target)) {
                    target.recycleCreep(this);
                }
                this.travelTo(target, { range: 1 });
            } else if (this.store.getFreeCapacity() >= this.getActiveBodyparts(WORK)) {
                if (this.pos.getRangeTo(target) < 9 && (this.hasKeeper(target) || this.destinationSpawningKeeper())) {
                    this.say('🚨KEEPER🚨');
                    this.memory.destination = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[target.id];
                } else {
                    delete this.memory.destination;
                }

                if (this.memory.destination) {
                    const lairPositions = Object.values(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).map((lairId) => {
                        return { pos: Game.getObjectById(lairId).pos, range: 0 };
                    });
                    this.travelTo(Game.getObjectById(this.memory.destination), {
                        range: 7,
                        flee: true,
                        goals: lairPositions,
                        avoidSourceKeepers: false,
                    }); // Travel back to home room
                    return;
                }

                if (!this.memory.destination) {
                    const result = this.harvest(target);
                    if (result === ERR_NOT_IN_RANGE) {
                        this.travelTo(target, { maxOps: 20000, avoidHostileRooms: true, range: 1 });
                    } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                        Memory.remoteData[this.memory.assignment].mineralAvailableAt = Game.time + target.ticksToRegeneration;
                        this.suicide();
                    }
                }
            } else {
                this.storeCargo();
                // recycle
                if (!this.memory.targetId && this.ticksToLive < 200) {
                    this.memory.targetId = this.room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_SPAWN })[0].id;
                }
            }
        }
    }

    private findTarget(): Id<Mineral> {
        return Object.keys(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).find(
            (sourceId) => Game.getObjectById(sourceId) instanceof Mineral
        ) as Id<Mineral>;
    }

    private destinationSpawningKeeper(): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.memory.targetId];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 16;
    }

    private hasKeeper(target: any): boolean {
        return !!target.pos.findInRange(FIND_HOSTILE_CREEPS, 5, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }
}
