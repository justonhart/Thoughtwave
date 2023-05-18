import { addLabTask, getBoostsAvailable } from '../modules/labManagement';
import { PopulationManagement } from '../modules/populationManagement';
import { addMarketOrder, addResourceRequest, addShipment, shipmentReady } from '../modules/resourceManagement';
import { getFactoryResourcesNeeded } from '../modules/roomManagement';
import { findRepairTargets, getStructuresToProtect } from '../modules/roomManagement';

const RESOURCE_COMPRESSION_MAP = {
    [RESOURCE_UTRIUM]: RESOURCE_UTRIUM_BAR,
    [RESOURCE_LEMERGIUM]: RESOURCE_LEMERGIUM_BAR,
    [RESOURCE_ZYNTHIUM]: RESOURCE_ZYNTHIUM_BAR,
    [RESOURCE_KEANIUM]: RESOURCE_KEANIUM_BAR,
    [RESOURCE_GHODIUM]: RESOURCE_GHODIUM_MELT,
    [RESOURCE_OXYGEN]: RESOURCE_OXIDANT,
    [RESOURCE_HYDROGEN]: RESOURCE_REDUCTANT,
    [RESOURCE_CATALYST]: RESOURCE_PURIFIER,
    [RESOURCE_ENERGY]: RESOURCE_BATTERY,
};

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
        } else if (this.getResourceAmount(RESOURCE_ENERGY) >= 350000 && this.getResourceAmount(RESOURCE_BATTERY) >= 100000) {
            return EnergyStatus.OVERFLOW;
        } else if (this.getResourceAmount(RESOURCE_ENERGY) >= 350000) {
            return EnergyStatus.SURPLUS;
        } else if (this.getResourceAmount(RESOURCE_ENERGY) >= 200000) {
            return EnergyStatus.STABLE;
        } else if (this.getResourceAmount(RESOURCE_ENERGY) >= Math.min(this.energyCapacityAvailable * 10, 25000)) {
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
        let posToCheck = this.memory.stampLayout.link.find((linkDetail) => linkDetail.type === 'rm')?.pos?.toRoomPos();

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
        posToCheck = this.memory.stampLayout.link.find((linkDetail) => linkDetail.type === 'controller')?.pos?.toRoomPos();

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

Object.defineProperty(Room.prototype, 'remoteSources', {
    get: function (this: Room) {
        return Object.keys(this.memory.remoteSources);
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(Room.prototype, 'remoteMiningRooms', {
    get: function (this: Room) {
        return this.remoteSources.map((s) => s.split('.')[2]);
    },
    enumerable: false,
    configurable: true,
});

Room.prototype.addLabTask = function (this: Room, opts: LabTaskPartial): ScreepsReturnCode {
    return addLabTask(this, opts);
};

Room.prototype.getBoostsAvailable = function (this: Room, boostTypes: BoostType[]) {
    return getBoostsAvailable(this, boostTypes);
};

Room.prototype.getDefenseHitpointTarget = function (this: Room): number {
    return this.controller.level === 8 ? 300000000 : this.controller.level >= 6 ? this.controller.level * this.controller.level * 50000 : 200000;
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

Room.prototype.getResourceAmount = function (this: Room, resource: ResourceConstant): number {
    return (this.storage?.store[resource] ?? 0) + (this.terminal?.store[resource] ?? 0) + (this.memory.transferBuffer[resource] ?? 0);
};

Room.prototype.getCompressedResourceAmount = function (this: Room, resource: ResourceConstant): number {
    return Object.keys(RESOURCE_COMPRESSION_MAP).includes(resource)
        ? (resource === RESOURCE_ENERGY ? 10 : 5) * this.getResourceAmount(RESOURCE_COMPRESSION_MAP[resource])
        : 0;
};

Room.prototype.getIncomingResourceAmount = function (this: Room, resource: ResourceConstant): number {
    return Object.values(Memory.shipments).reduce(
        (sum, nextShipment) => (nextShipment.recipient === this.name && nextShipment.resource === resource ? sum + nextShipment.amount : sum),
        0
    );
};

Room.prototype.getOutgoingResourceAmount = function (this: Room, resource: ResourceConstant): number {
    return this.memory.shipments.reduce(
        (sum, nextShipmentId) =>
            Memory.shipments[nextShipmentId]?.resource === resource && Memory.shipments[nextShipmentId]?.recipient !== this.name
                ? sum + Memory.shipments[nextShipmentId].amount
                : sum,
        0
    );
};

Room.prototype.addFactoryTask = function (this: Room, product: ResourceConstant, amount: number): ScreepsReturnCode {
    if (Memory.debug.logFactoryTasks) {
        console.log(`Attempting to create factory task in ${this.name}: ${amount} ${product}`);
    }

    if (amount <= 0) {
        return ERR_INVALID_ARGS;
    }

    if (this.factory) {
        if (this.memory.factoryTask) {
            if (Memory.debug?.logFactoryTasks) {
                console.log(`Failed to add factory task in ${this.name}: task already running`);
            }
            return ERR_BUSY;
        } else {
            let resourcesNeeded = getFactoryResourcesNeeded({ product: product, amount: amount });
            let roomHasEnoughMaterials = resourcesNeeded.reduce(
                (needsMet, nextNeed) => needsMet && nextNeed.amount <= this.getResourceAmount(nextNeed.resource),
                true
            );
            if (!roomHasEnoughMaterials) {
                if (Memory.debug?.logFactoryTasks) {
                    console.log(`Failed to add factory task in ${this.name}: missing necessary resources`);
                }
                return ERR_NOT_ENOUGH_RESOURCES;
            }
            const resourceNeedAboveFactoryCapacity = resourcesNeeded.reduce((total, nextNeed) => total + nextNeed.amount, 0) > 50000;
            if (amount <= 50000 && !resourceNeedAboveFactoryCapacity && !this.factory.store.getUsedCapacity()) {
                const newTask: FactoryTask = {
                    product: product,
                    amount: amount,
                    needs: resourcesNeeded,
                };
                this.memory.factoryTask = newTask;
                if (Memory.debug.logFactoryTasks) {
                    console.log(`${Game.time} - ${this.name} added task -> ${newTask.amount} ${newTask.product}`);
                }
                return OK;
            }
            if (Memory.debug?.logFactoryTasks) {
                console.log(`Failed to add factory task in ${this.name}: request too large`);
            }
            return ERR_FULL;
        }
    }
};

Room.prototype.addRequest = function (this: Room, resource: ResourceConstant, amount: number): number {
    return addResourceRequest(this.name, resource, amount);
};

Room.prototype.addShipment = function (this: Room, destination: string, resource: ResourceConstant, amount: number): ScreepsReturnCode {
    const shipment: Shipment = {
        sender: this.name,
        recipient: destination,
        resource: resource,
        amount: amount,
    };
    return addShipment(shipment);
};

Room.prototype.addMarketOrder = function (this: Room, marketId: string, amount: number) {
    return addMarketOrder(this.name, marketId, amount);
};
