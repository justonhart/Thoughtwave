import { findRepairTargets } from '../modules/roomManagement';

RoomPosition.prototype.toMemSafe = function (this: RoomPosition): string {
    return `${this.x}.${this.y}.${this.roomName}`;
};

Room.prototype.getRepairTarget = function (this: Room): Id<Structure> {
    let targets = this.memory.repairQueue;

    if (targets.length === 0 && !this.memory.repairSearchCooldown) {
        this.memory.repairQueue = findRepairTargets(this);
        this.memory.repairSearchCooldown = 250;
    }

    return this.memory.repairQueue.shift();
};
