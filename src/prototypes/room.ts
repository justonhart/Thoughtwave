import { addLabTask, getResourceBoostsAvailable } from '../modules/labManagement';
import { PopulationManagement } from '../modules/populationManagement';
import { getFactoryResourcesNeeded } from '../modules/resourceManagement';
import { findRepairTargets, getStructuresToProtect } from '../modules/roomManagement';
import { readStampLayoutFromMemory } from '../modules/roomDesign';

RoomPosition.prototype.toMemSafe = function (this: RoomPosition): string {
    return `${this.x}.${this.y}.${this.roomName}`;
};

RoomPosition.prototype.neighbors = function (this: RoomPosition, includeDiagonal: boolean = true, includeCenter: boolean = false): RoomPosition[] {
    const adjacentPositions = [];

    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if ((!includeCenter && dx === 0 && dy === 0) || (!includeDiagonal && dx !== 0 && dy !== 0)) {
                // Skip the current position
                continue;
            }

            const adjX = this.x + dx;
            const adjY = this.y + dy;

            // Check if the adjacent position is in the room
            if (adjX < 0 || adjX > 49 || adjY < 0 || adjY > 49) {
                continue;
            }

            // Create a new RoomPosition object for the adjacent position
            const adjPos = new RoomPosition(adjX, adjY, this.roomName);

            // Add the adjacent position to the list of adjacent positions
            adjacentPositions.push(adjPos);
        }
    }

    return adjacentPositions;
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
        let posToCheck = this.memory.anchorPoint?.toRoomPos() || this.memory.managerPos?.toRoomPos();
        if (this.memory.layout === RoomLayout.STAMP) {
            posToCheck = this.stamps.link.find((linkDetail) => linkDetail.type === 'rm')?.pos;
        } else if (this.memory.managerLink) {
            return Game.getObjectById(this.memory.managerLink);
        }

        let link = posToCheck
            ?.findInRange(FIND_MY_STRUCTURES, 1)
            .filter((structure) => structure.structureType === STRUCTURE_LINK)
            .pop();
        this.memory.managerLink = link?.id;
        return link;
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'upgraderLink', {
    get: function (this: Room) {
        let posToCheck: RoomPosition;
        if (this.memory.layout === RoomLayout.STAMP) {
            posToCheck = this.stamps.link.find((linkDetail) => linkDetail.type === 'controller')?.pos;
        } else {
            posToCheck = this.memory.upgraderLinkPos.toRoomPos();
        }

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

Object.defineProperty(Room.prototype, 'factory', {
    get: function (this: Room) {
        return this.find(FIND_MY_STRUCTURES).find((s) => s.structureType === STRUCTURE_FACTORY && s.isActive());
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'observer', {
    get: function (this: Room) {
        return this.find(FIND_MY_STRUCTURES).find((s) => s.structureType === STRUCTURE_OBSERVER && s.isActive());
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'powerSpawn', {
    get: function (this: Room) {
        return this.find(FIND_MY_STRUCTURES).find((s) => s.structureType === STRUCTURE_POWER_SPAWN && s.isActive());
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'stamps', {
    get: function (this: Room) {
        if (this.memory.layout === RoomLayout.STAMP) {
            return readStampLayoutFromMemory(this);
        }
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
    return this.controller.level < 8 ? this.controller.level * this.controller.level * 50000 : 300000000;
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

Room.prototype.addShipment = function (
    this: Room,
    destination: string,
    resource: ResourceConstant,
    amount: number,
    marketOrderId?: string
): ScreepsReturnCode {
    let storageAmount = this.storage?.store[resource] ?? 0;
    let terminalAmount = this.terminal?.store[resource] ?? 0;

    if (amount <= 0) {
        return ERR_INVALID_ARGS;
    }
    if (storageAmount + terminalAmount < amount) {
        return ERR_NOT_ENOUGH_RESOURCES;
    }

    let shipment: Shipment = {
        destinationRoom: destination,
        resource: resource,
        amount: amount,
    };

    if (marketOrderId) {
        shipment.marketOrderId = marketOrderId;
    }

    this.memory.shipments ? this.memory.shipments.push(shipment) : (this.memory.shipments = [shipment]);
    return OK;
};

Room.prototype.addFactoryTask = function (this: Room, product: ResourceConstant, amount: number): ScreepsReturnCode {
    if (this.factory) {
        if (this.memory.factoryTask) {
            return ERR_BUSY;
        } else {
            let resourcesNeeded = getFactoryResourcesNeeded({ product: product, amount: amount });
            let roomHasEnoughMaterials = resourcesNeeded
                .map((need) => this.storage.store[need.res] >= need.amount)
                .reduce((needsMet, nextNeedMet) => needsMet && nextNeedMet);
            if (!roomHasEnoughMaterials) {
                return ERR_NOT_ENOUGH_RESOURCES;
            }
            let resourceNeedAboveFactoryCapacity = resourcesNeeded.map((need) => need.amount).reduce((total, next) => total + next) > 50000;
            if (amount <= 50000 && !resourceNeedAboveFactoryCapacity && !this.factory.store.getUsedCapacity()) {
                this.memory.factoryTask = { product: product, amount: amount };
                return OK;
            }
            return ERR_FULL;
        }
    }
};
