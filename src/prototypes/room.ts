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

Object.defineProperty(Room.prototype, 'energyStatus', {
    get: function (this: Room) {
        if (!this.storage || !this.storage.my) {
            return undefined;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 500000) {
            return EnergyStatus.SURPLUS;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 250000) {
            return EnergyStatus.STABLE;
        } else if (this.storage.store[RESOURCE_ENERGY] >= this.energyCapacityAvailable * 10) {
            return EnergyStatus.RECOVERING;
        } else {
            return EnergyStatus.CRITICAL;
        }
    },
    enumerable: false,
    configurable: true,
});
