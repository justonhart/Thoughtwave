import { findCollectionTargets, findRepairTargets } from '../modules/roomManagement';

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

Room.prototype.getCollectionTarget = function (this: Room): Id<Structure> | Id<Resource> | Id<Tombstone> | Id<Ruin> {
    let targets = this.memory.collectQueue;

    if (targets.length === 0) {
        this.memory.collectQueue = findCollectionTargets(this);
    }

    return this.memory.collectQueue.shift();
};
