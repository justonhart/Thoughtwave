import { addLabTask, getResourceBoostsAvailable } from '../modules/labManagement';
import { posFromMem } from '../modules/memoryManagement';
import { PopulationManagement } from '../modules/populationManagement';
import { findRepairTargets, getStructuresToProtect } from '../modules/roomManagement';

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
        if (!this.storage?.my || !this.storage.isActive()) {
            return undefined;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 500000) {
            return EnergyStatus.OVERFLOW;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 350000) {
            return EnergyStatus.SURPLUS;
        } else if (this.storage.store[RESOURCE_ENERGY] >= 200000) {
            return EnergyStatus.STABLE;
        } else if (this.storage.store[RESOURCE_ENERGY] >= Math.min(this.energyCapacityAvailable * 10, 25000)) {
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

Object.defineProperty(Room.prototype, 'creeps', {
    get: function (this: Room) {
        return Object.values(Game.creeps).filter((creep) => creep.memory.room === this.name);
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'mineral', {
    get: function (this: Room) {
        return this.find(FIND_MINERALS).pop();
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'managerLink', {
    get: function (this: Room) {
        let posToCheck = posFromMem(this.memory.anchorPoint || this.memory.managerPos);
        let link = posToCheck
            ?.findInRange(FIND_MY_STRUCTURES, 1)
            .filter((structure) => structure.structureType === STRUCTURE_LINK)
            .pop();
        return link;
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'upgraderLink', {
    get: function (this: Room) {
        let posToCheck = posFromMem(this.memory.upgraderLinkPos);
        let link = posToCheck
            ?.lookFor(LOOK_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_LINK)
            .pop();
        return link;
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'workerCapacity', {
    get: function (this: Room) {
        return PopulationManagement.calculateWorkerCapacity(this);
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'labs', {
    get: function (this: Room) {
        return this.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_LAB && s.isActive());
    },
    enumerable: false,
    configurable: true,
});

Room.prototype.addLabTask = function (this: Room, opts: LabTaskOpts): ScreepsReturnCode {
    return addLabTask(this, opts);
};

Room.prototype.getBoostResourcesAvailable = function (this: Room, boostTypes: BoostType[]) {
    return getResourceBoostsAvailable(this, boostTypes);
};

Room.prototype.getDefenseHitpointTarget = function (this: Room): number {
    return this.controller.level * this.controller.level * 50000;
};

Room.prototype.getNextNukeProtectionTask = function (this: Room): Id<Structure> | Id<ConstructionSite> {
    let structuresToProtect = getStructuresToProtect(this.find(FIND_NUKES)).map((id) => Game.getObjectById(id));
    let spawn = structuresToProtect.find((s) => s.structureType === STRUCTURE_SPAWN);
    if (spawn) {
        return spawn.getRampart()?.id ?? spawn.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]?.id;
    }

    let storage = structuresToProtect.find((s) => s.structureType === STRUCTURE_STORAGE);
    if (storage) {
        return storage.getRampart()?.id ?? storage.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]?.id;
    }

    let terminal = structuresToProtect.find((s) => s.structureType === STRUCTURE_TERMINAL);
    if (terminal) {
        return terminal.getRampart()?.id ?? terminal.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]?.id;
    }

    let tower = structuresToProtect.find((s) => s.structureType === STRUCTURE_TOWER);
    if (tower) {
        return tower.getRampart()?.id ?? tower.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0]?.id;
    }
    return structuresToProtect.map((structure) => structure.getRampart() ?? structure.pos.lookFor(LOOK_CONSTRUCTION_SITES)[0])?.[0]?.id;
};
