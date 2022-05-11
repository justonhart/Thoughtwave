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

Room.prototype.removeFromRepairQueue = function (this: Room, idToRemove: string): void {
    this.memory.repairQueue = this.memory.repairQueue.filter((id) => id !== idToRemove);
};

Object.defineProperty(Room.prototype, 'energyStatus', {
    get: function (this: Room) {
        if (!this.storage || !this.storage.my) {
            return undefined;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 400000) {
            return EnergyStatus.SURPLUS;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 200000) {
            return EnergyStatus.STABLE;
        } else if ((this.storage.store[RESOURCE_ENERGY] >= Math.min(this.energyCapacityAvailable * 10), 25000)) {
            return EnergyStatus.RECOVERING;
        } else {
            return EnergyStatus.CRITICAL;
        }
    },
    enumerable: false,
    configurable: true,
});

Room.prototype.canSpawn = function (this: Room): boolean {
    return this.find(FIND_MY_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_SPAWN).length > 0;
};
