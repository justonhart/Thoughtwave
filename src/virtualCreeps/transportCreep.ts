import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    private previousTargetId: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> | Id<Mineral> | Id<Source>;
    protected incomingEnergyAmount: number = 0; // Picked up energy in same tick to do proper retargeting
    protected incomingMineralAmount: number = 0; // Picked up non-energy in same tick to do proper retargeting
    protected outgoingResourceAmount: number = 0; // Dropped off energy in the same tick to do proper retargeting
    protected actionTaken: boolean = false;
    protected labs: StructureLab[];
    protected run() {
        if (this.memory.gathering === true) {
            this.gatherEnergy();

            if (!this.memory.gathering) {
                this.runTransporterTasks();
            }
        } else {
            this.runTransporterTasks();

            if (this.memory.gathering) {
                this.gatherEnergy();
            }
        }
    }

    private runTransporterTasks() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target && !this.memory.labNeeds?.length) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        let stop = false;

        if (this.memory.labNeeds?.length) {
            this.manageLabs();
        } else {
            stop = this.runNonLabPrepTasks();

            //round 2
            if (!stop && !this.memory.targetId) {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);

                if (this.memory.labNeeds?.length) {
                    this.manageLabs();
                } else {
                    this.runNonLabPrepTasks();
                }
            }
        }
    }

    private runNonLabPrepTasks() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (target instanceof Resource) {
            this.runPickupJob(target);
            return false;
        } else if (
            target instanceof StructureContainer &&
            this.homeroom.memory.layout === RoomLayout.STAMP &&
            this.homeroom.memory.stampLayout.container.some(
                (containerStamp) => containerStamp.type === 'center' && containerStamp.pos === target.pos.toMemSafe()
            )
        ) {
            this.runRefillJob(target);
            return false;
        } else if (
            target instanceof Tombstone ||
            target instanceof Ruin ||
            target instanceof StructureContainer ||
            target?.status === LabStatus.NEEDS_EMPTYING
        ) {
            this.runCollectionJob(target);
            return false;
        } else if (
            target instanceof StructureSpawn ||
            target instanceof StructureExtension ||
            target instanceof StructureTower ||
            target instanceof StructureLab
        ) {
            this.runRefillJob(target);
            return false;
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
            return false;
        } else if (target instanceof StructurePowerSpawn) {
            this.runRefillPowerSpawnJob(target);
            return false;
        }

        return true;
    }

    protected findTarget(): any {
        this.say('targeting');
    }

    //gather energy to distribute
    protected gatherEnergy(): void {
        this.memory.currentTaskPriority = Priority.HIGH;

        let target = Game.getObjectById(this.memory.energySource);
        if (!target) {
            this.memory.energySource = this.findEnergySource();
            target = Game.getObjectById(this.memory.energySource);
        }

        if (target instanceof Structure || target instanceof Ruin) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
            } else if (!this.actionTaken) {
                let result = this.withdraw(target, RESOURCE_ENERGY);
                switch (result) {
                    case 0:
                        // @ts-ignore
                        this.incomingEnergyAmount += Math.min(this.store.getFreeCapacity(), target.store.energy);
                        this.actionTaken = true;
                    case ERR_FULL:
                        this.stopGathering();
                        break;
                }
            }

            return;
        }

        if (target instanceof Resource) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingEnergyAmount });
            } else if (!this.actionTaken) {
                switch (this.pickup(target)) {
                    case 0:
                        if (target.resourceType === RESOURCE_ENERGY) {
                            this.incomingEnergyAmount += Math.min(this.store.getFreeCapacity(), target.amount);
                        } else {
                            this.incomingMineralAmount += Math.min(this.store.getFreeCapacity(), target.amount);
                        }
                        this.actionTaken = true;
                    case ERR_FULL:
                        this.stopGathering();
                        break;
                }
            }

            return;
        }

        //if no source is found, use held resources
        this.stopGathering();
    }

    protected findEnergySource(): Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> {
        if (this.room.storage?.store[RESOURCE_ENERGY] >= this.store.getCapacity()) {
            return this.room.storage.id;
        }

        let nonStorageSources: (Ruin | Resource | Structure)[];

        const ruins = this.room.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });

        const looseEnergyStacks = this.room.find(FIND_DROPPED_RESOURCES).filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount);
        let containers = this.room.find(FIND_STRUCTURES).filter((str) => {
            let isAllowedStampContainer = true;
            // In Stamps do not allow retrieving energy from center/rm containers or miner containers with links
            if (this.room.memory.layout === RoomLayout.STAMP) {
                const container = this.room.memory.stampLayout.container.find((containerStamp) => str.pos.toMemSafe() === containerStamp.pos);
                if (container && container.type?.includes('source')) {
                    isAllowedStampContainer = !this.room.memory.stampLayout.link.some(
                        (linkStamp) =>
                            linkStamp.type === container.type &&
                            linkStamp.pos
                                .toRoomPos()
                                .lookFor(LOOK_STRUCTURES)
                                .some((lookStr) => lookStr.structureType === STRUCTURE_LINK)
                    );
                } else {
                    isAllowedStampContainer = false;
                }
            }
            return str.structureType === STRUCTURE_CONTAINER && str.store.energy >= this.store.getCapacity() && isAllowedStampContainer;
        });

        nonStorageSources = [...(ruins ?? []), ...(looseEnergyStacks ?? []), ...containers];
        if (nonStorageSources.length) {
            return this.pos.findClosestByRange(nonStorageSources).id;
        }

        if (this.room.terminal?.store?.energy >= this.store.getCapacity()) {
            return this.room.terminal.id;
        }
    }

    protected stopGathering() {
        this.memory.gathering = false;
        delete this.memory.energySource;
    }

    protected storeCargo() {
        this.memory.currentTaskPriority = Priority.HIGH;
        let resourceToStore: any = Object.keys(this.store).shift();
        if (!this.pos.isNearTo(this.homeroom.storage)) {
            this.travelTo(this.homeroom.storage, {
                ignoreCreeps: true,
                range: 1,
                currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount,
            });
        } else if (!this.actionTaken) {
            let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
            switch (storeResult) {
                case ERR_NOT_IN_RANGE:
                    break;
                case 0:
                    this.actionTaken = true;
                    this.outgoingResourceAmount += this.store[resourceToStore].amount;
                    if (this.store[resourceToStore] === this.store.getUsedCapacity()) {
                        this.onTaskFinished();
                    }
                    break;
                case ERR_FULL:
                default:
                    this.onTaskFinished();
                    break;
            }
        }
    }

    protected findRefillTarget(): Id<Structure> {
        const ROOM_STRUCTURES = this.homeroom
            .find(FIND_STRUCTURES)
            .filter((s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL);
        const towers = ROOM_STRUCTURES.filter(
            (structure) => structure.structureType === STRUCTURE_TOWER && this.previousTargetId !== structure.id && structure.store.energy < 900
        ) as StructureTower[];
        if (towers.some((tower) => tower.store.energy < 300)) {
            return this.pos.findClosestByPath(
                towers.filter((tower) => tower.store.energy < 300),
                { ignoreCreeps: true }
            ).id;
        }

        let labs = ROOM_STRUCTURES.filter(
            (structure) =>
                structure.structureType === STRUCTURE_LAB &&
                this.previousTargetId !== structure.id &&
                structure.store.energy < structure.store.getCapacity(RESOURCE_ENERGY)
        );
        if (labs.length) {
            return this.pos.findClosestByPath(labs, { ignoreCreeps: true }).id;
        }

        if (
            this.room.energyAvailable < this.room.energyCapacityAvailable ||
            (this.room.memory.layout === RoomLayout.STAMP && this.room.controller.level < 5)
        ) {
            let targetStructureTypes: string[] = [STRUCTURE_EXTENSION, STRUCTURE_SPAWN];

            const isStampRoom = this.homeroom.memory.layout === RoomLayout.STAMP;
            const hasMissingManagersOrContainers =
                isStampRoom &&
                this.homeroom.controller.level > 1 &&
                // Number of center managers
                //@ts-ignore
                (this.homeroom.creeps.reduce(
                    (sum: number, nextCreep: Creep) =>
                        nextCreep.memory.role === Role.MANAGER &&
                        this.homeroom.memory.stampLayout.managers.some(
                            (managerStamp) => managerStamp.type === 'center' && managerStamp.pos === nextCreep.memory.destination
                        )
                            ? sum + 1
                            : sum,
                    0
                ) <
                    // Number of center managers the room should have
                    this.homeroom.memory.stampLayout.managers.reduce(
                        (sum, nextStamp) => (nextStamp.type === 'center' && nextStamp.rcl <= this.homeroom.controller.level ? sum + 1 : sum),
                        0
                    ) ||
                    // Number of center containers
                    ROOM_STRUCTURES.reduce(
                        (sum, structure) =>
                            structure.structureType === (STRUCTURE_CONTAINER as StructureConstant) &&
                            this.homeroom.memory.stampLayout.container.some(
                                (containerStamp) => containerStamp.type === 'center' && containerStamp.pos === structure.pos.toMemSafe()
                            )
                                ? sum + 1
                                : sum,
                        0
                    )) <
                    // Number of containers the room should have
                    this.homeroom.memory.stampLayout.container.reduce(
                        (sum, containerStamp) =>
                            containerStamp.type === 'center' && containerStamp.rcl <= this.homeroom.controller.level ? sum + 1 : sum,
                        0
                    );
            // Do not refill spawn when all containers/managers are present
            if (isStampRoom && !hasMissingManagersOrContainers) {
                targetStructureTypes = [STRUCTURE_EXTENSION];
            }
            // If no center link is present in Stamp rooms then fill up containers
            if (
                isStampRoom &&
                (this.homeroom.controller.level < 5 ||
                    !ROOM_STRUCTURES.some(
                        (structure) =>
                            structure.structureType === STRUCTURE_LINK &&
                            this.homeroom.memory.stampLayout.link.some(
                                (linkStamp) => linkStamp.type === 'center' && linkStamp.pos === structure.pos.toMemSafe()
                            )
                    ))
            ) {
                targetStructureTypes.push(STRUCTURE_CONTAINER);
            }

            let spawnStructures = ROOM_STRUCTURES.filter(
                (structure) =>
                    // @ts-ignore
                    targetStructureTypes.includes(structure.structureType) &&
                    this.previousTargetId !== structure.id &&
                    // @ts-ignore
                    structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY) &&
                    // Remove center extensions if there are missing containers/extensions
                    (!isStampRoom ||
                        structure.structureType !== STRUCTURE_EXTENSION ||
                        hasMissingManagersOrContainers ||
                        !this.homeroom.memory.stampLayout.extension.some(
                            (extensionStamp) =>
                                extensionStamp.pos === structure.pos.toMemSafe() &&
                                (extensionStamp.type === 'center' || extensionStamp.type?.includes('source'))
                        )) &&
                    // Fill up center containers
                    (!isStampRoom ||
                        structure.structureType !== (STRUCTURE_CONTAINER as StructureConstant) ||
                        this.homeroom.memory.stampLayout.container.some(
                            (containerStamp) => containerStamp.pos === structure.pos.toMemSafe() && containerStamp.type === 'center'
                        ))
            ) as AnyStructure[];

            if (spawnStructures.length) {
                // Switch between containers which is important in early rcl
                if (this.homeroom.memory.layout === RoomLayout.STAMP && this.homeroom.controller.level < 5 && !hasMissingManagersOrContainers) {
                    if (
                        spawnStructures.length > 1 &&
                        spawnStructures.every((structure) => structure.structureType === STRUCTURE_CONTAINER) &&
                        spawnStructures.some((structure: StructureContainer) => structure.store.energy)
                    ) {
                        return spawnStructures.reduce((lowestContainer: StructureContainer, nextContainer: StructureContainer) =>
                            lowestContainer.store.energy < nextContainer.store.energy ? lowestContainer : nextContainer
                        ).id;
                    }
                }
                return this.pos.findClosestByPath(spawnStructures, { ignoreCreeps: true }).id;
            }
        }

        // Now fill them completely
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }

        // Bunker layouts dont need this since the manager takes care of it ELSE see if a powerSpawn needs energy or power (if power is available)
        if (this.homeroom.memory.layout !== RoomLayout.BUNKER && this.homeroom.controller.level === 8) {
            const powerSpawnInNeed = ROOM_STRUCTURES.filter(
                (structure) =>
                    structure.structureType === STRUCTURE_POWER_SPAWN &&
                    (!structure.store.getUsedCapacity(RESOURCE_ENERGY) ||
                        (!structure.store.getUsedCapacity(RESOURCE_POWER) &&
                            ROOM_STRUCTURES.some(
                                (structure) =>
                                    (structure.structureType === STRUCTURE_STORAGE || structure.structureType === STRUCTURE_TERMINAL) &&
                                    structure.store.power
                            )))
            ) as StructurePowerSpawn[];
            if (powerSpawnInNeed.length) {
                return powerSpawnInNeed[0].id;
            }
        }
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> | Id<Tombstone> | Id<Ruin> {
        if (Game.time < this.memory.sleepCollectTil) {
            return;
        }

        let room = this.homeroom;
        if (roomName) {
            room = Game.rooms[roomName];
        }
        if (!room) {
            return undefined;
        }

        if (this.room.storage) {
            const labsNeedingEmptied = this.room.labs?.filter((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
            if (labsNeedingEmptied.length) {
                return this.pos.findClosestByRange(labsNeedingEmptied).id;
            }

            const ruinsWithResources = room.find(FIND_RUINS, { filter: (ruin) => ruin.store.getUsedCapacity() > 1000 });
            if (ruinsWithResources.length) {
                return this.pos.findClosestByPath(ruinsWithResources, { ignoreCreeps: true, range: 1 })?.id;
            }
        }

        // For Stamps it only allows containers at miners when they are too full (should be emptied through link) or there isnt a link yet
        const containers: StructureContainer[] = room.find(FIND_STRUCTURES).filter(
            (structure) =>
                structure.structureType === STRUCTURE_CONTAINER &&
                structure.store.getUsedCapacity() &&
                // Get mineral containers and miner containers that not yet have a link (only checks for rcl but it will still gather energy from container until link is build if it is too full)
                (room.memory.layout !== RoomLayout.STAMP ||
                    room.memory.stampLayout.container.some(
                        (containerStamp) =>
                            containerStamp.pos === structure.pos.toMemSafe() &&
                            ((containerStamp.type === 'mineral' && this.room.storage) ||
                                (containerStamp.type?.includes('source') &&
                                    (structure.store.getFreeCapacity() < 300 ||
                                        room.memory.stampLayout.link.find((linkDetail) => containerStamp.type === linkDetail.type)?.rcl >
                                            this.homeroom.controller.level)))
                    ))
        ) as StructureContainer[];
        const fillingContainers = containers.filter((container) => container.store.getUsedCapacity() >= container.store.getCapacity() / 2);
        if (fillingContainers.length) {
            return fillingContainers.reduce((fullestContainer, nextContainer) =>
                fullestContainer.store.getUsedCapacity() > nextContainer.store.getUsedCapacity() ? fullestContainer : nextContainer
            ).id;
        }

        const looseResources = room.find(FIND_DROPPED_RESOURCES);
        if (looseResources.filter((r) => r.amount > 100 && (room.storage || r.resourceType === RESOURCE_ENERGY)).length) {
            return looseResources
                .filter((r) => r.amount > 100 && (room.storage || r.resourceType === RESOURCE_ENERGY))
                .reduce((biggestResource, resourceToCompare) =>
                    biggestResource.amount > resourceToCompare.amount ? biggestResource : resourceToCompare
                ).id;
        }

        const tombstonesWithResources = room.find(FIND_TOMBSTONES).filter((t) => t.store.getUsedCapacity() > this.store.getCapacity() / 2);
        if (tombstonesWithResources.length) {
            return this.pos.findClosestByPath(tombstonesWithResources, { ignoreCreeps: true, range: 1 }).id;
        }

        if (containers.length) {
            return containers.reduce((fullestContainer, nextContainer) =>
                fullestContainer.store.getUsedCapacity() > nextContainer.store.getUsedCapacity() ? fullestContainer : nextContainer
            ).id;
        }
        if (looseResources.filter((r) => room.storage || r.resourceType === RESOURCE_ENERGY).length) {
            return looseResources
                .filter((r) => room.storage || r.resourceType === RESOURCE_ENERGY)
                .reduce((most, next) => (most.amount > next.amount ? most : next)).id;
        }

        this.memory.sleepCollectTil = Game.time + 10;
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage | StructureLab | StructureContainer) {
        this.memory.currentTaskPriority = Priority.HIGH;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (!this.store.energy) {
                this.memory.gathering = this.store.getUsedCapacity() === 0; // Gather energy or drop off minerals
                delete this.memory.targetId;
            } else if (!this.pos.isNearTo(target)) {
                let result = this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                if (this.memory._m.stuckCount && this.memory._m.path.length === 1) {
                    let adjacentManagerAdjacentToTarget = this.pos
                        .findInRange(FIND_MY_CREEPS, 1, { filter: (c) => c.memory.role === Role.MANAGER && c.pos.isNearTo(target) })
                        ?.pop();
                    this.transfer(adjacentManagerAdjacentToTarget, RESOURCE_ENERGY);
                }
            } else if (!this.actionTaken) {
                let result = this.transfer(target, RESOURCE_ENERGY);
                switch (result) {
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.memory.gathering = true;
                    case ERR_FULL:
                        this.onTaskFinished();
                        break;
                    case OK:
                        this.actionTaken = true;
                        this.outgoingResourceAmount += Math.min(this.store.energy, targetFreeCapacity);
                        this.onTaskFinished();
                        break;
                }
            }
        } else {
            this.onTaskFinished();
        }
    }

    protected runRefillPowerSpawnJob(target: StructurePowerSpawn) {
        this.memory.currentTaskPriority = Priority.HIGH;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (!this.store.energy) {
                this.memory.gathering = this.store.getUsedCapacity() === 0; // Gather energy or drop off minerals
                delete this.memory.targetId;
            } else if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
            } else if (!this.actionTaken) {
                let result = this.transfer(target, RESOURCE_ENERGY);
                switch (result) {
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.memory.gathering = true;
                    case ERR_FULL:
                        this.onTaskFinished();
                        break;
                    case OK:
                        this.actionTaken = true;
                        this.outgoingResourceAmount += Math.min(this.store.energy, targetFreeCapacity);
                        this.onTaskFinished();
                        break;
                }
            }
        } else if (target.store.getFreeCapacity(RESOURCE_POWER)) {
            targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_POWER);
            if (!this.store.power) {
                const target = [this.room.storage, this.room.terminal].find((struct) => struct.store[RESOURCE_POWER]);
                if (!target) {
                    this.onTaskFinished();
                } else if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                } else {
                    let amountToWithdraw = Math.min(targetFreeCapacity, this.store.getFreeCapacity(), target.store.power);
                    let result = this.withdraw(target, RESOURCE_POWER, amountToWithdraw);
                    if (result === OK) {
                        this.incomingMineralAmount += amountToWithdraw;
                    } else {
                        this.onTaskFinished();
                    }
                }
            } else if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
            } else if (!this.actionTaken) {
                let result = this.transfer(target, RESOURCE_POWER);
                switch (result) {
                    case ERR_FULL:
                        this.onTaskFinished();
                        break;
                    case OK:
                        this.actionTaken = true;
                        this.outgoingResourceAmount += Math.min(this.store.power, targetFreeCapacity);
                        this.onTaskFinished();
                        break;
                }
            }
        } else {
            this.onTaskFinished();
        }
    }

    //gather resources for the purpose of storing
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone | StructureLab | Ruin): void {
        this.memory.currentTaskPriority = Priority.HIGH;

        let resourcesToWithdraw = target instanceof StructureLab ? [target.mineralType] : (Object.keys(target.store) as ResourceConstant[]);
        let nextResource: ResourceConstant = resourcesToWithdraw.shift();
        if (!this.pos.isNearTo(target)) {
            this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
        } else if (!this.actionTaken) {
            let result = this.withdraw(target, nextResource);
            switch (result) {
                case 0:
                    this.actionTaken = true;
                    if (target.store[nextResource] >= this.store.getFreeCapacity() || target instanceof StructureLab) {
                        this.onTaskFinished();
                    }
                    if (nextResource === RESOURCE_ENERGY) {
                        this.incomingEnergyAmount += Math.min(this.store.getFreeCapacity(), target.store[nextResource]);
                    } else {
                        this.incomingMineralAmount += Math.min(this.store.getFreeCapacity(), target.store[nextResource]);
                    }
                    break;
                default:
                    this.onTaskFinished();
                    break;
            }
        }
    }

    protected runPickupJob(resource: Resource): void {
        this.memory.currentTaskPriority = Priority.HIGH;
        if (!this.pos.isNearTo(resource)) {
            this.travelTo(resource, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
        } else if (!this.actionTaken) {
            let result = this.pickup(resource);
            switch (result) {
                case 0:
                    this.actionTaken = true;
                    if (resource.resourceType === RESOURCE_ENERGY) {
                        this.incomingEnergyAmount += resource.amount;
                    } else {
                        this.incomingMineralAmount += resource.amount;
                    }
                case ERR_FULL:
                    this.onTaskFinished();
            }
        }
    }

    protected manageLabs() {
        //check labs in included needs for preparedness
        this.labs = this.memory.labNeeds.map((need) => Game.getObjectById(need.lab));
        const labToClean = this.homeroom.labs.find((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
        const deliveringResources = Object.keys(this.store).some((res) => this.memory.labNeeds.some((need) => need.resource === res));
        if (labToClean && !deliveringResources) {
            this.cleanLab(labToClean);
        } else {
            this.supplyResourcesToLabs();
        }
    }

    protected cleanLab(labToClean: StructureLab) {
        this.memory.currentTaskPriority = Priority.HIGH;
        if (this.store.getFreeCapacity() === 0 || (this.store.getUsedCapacity() && this.pos.isNearTo(this.homeroom.storage))) {
            this.storeCargo();
        } else {
            if (this.pos.isNearTo(labToClean)) {
                this.withdraw(labToClean, labToClean.mineralType);
            } else {
                this.travelTo(labToClean, { range: 1 });
            }
        }
    }

    protected supplyResourcesToLabs() {
        this.memory.currentTaskPriority = Priority.HIGH;

        if (this.memory.gatheringLabResources) {
            let resourceList: { [resource: string]: number } = {};
            this.memory.labNeeds.forEach((need) => {
                !resourceList[need.resource] ? (resourceList[need.resource] = need.amount) : (resourceList[need.resource] += need.amount);
            });

            if (Object.keys(this.store).some((res) => !resourceList[res])) {
                this.storeCargo();
                return;
            }

            let totalAmountToGather = Math.min(
                this.store.getCapacity(),
                Object.values(resourceList).reduce((sum, next) => sum + next)
            );

            if (this.store.getUsedCapacity() >= totalAmountToGather) {
                this.memory.gatheringLabResources = false;
            } else {
                let resourceToGather = Object.keys(resourceList).find((res) => resourceList[res] > this.store[res]) as ResourceConstant;

                let target = [this.room.storage, this.room.terminal].find((struct) => struct.store[resourceToGather]);
                if (!target) {
                    const labIdForNeed = this.memory.labNeeds.find(need => need.resource === resourceToGather)?.lab;
                    const taskIdToCancel = Game.getObjectById(labIdForNeed)?.taskId;
                    delete this.memory.labNeeds;
                    delete this.homeroom.memory.labTasks[taskIdToCancel];
                    console.log(`${Game.time} - LabTask ${taskIdToCancel} in ${this.memory.room} cancelled`);
                } else if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                } else {
                    let amountToWithdraw = Math.min(
                        resourceList[resourceToGather] - this.store[resourceToGather],
                        this.store.getFreeCapacity(),
                        target.store[resourceToGather]
                    );
                    let result = this.withdraw(target, resourceToGather, amountToWithdraw);
                    if (result === OK) {
                        if (amountToWithdraw + this.store.getUsedCapacity() >= totalAmountToGather) {
                            this.memory.gatheringLabResources = false;
                        }
                    } else {
                        this.say('e');
                    }
                }
            }
        } else {
            //check in-memory need validity
            const labToCheck = Game.getObjectById(this.memory.labNeeds[0].lab);
            if (!labToCheck?.taskId || labToCheck.status === LabStatus.NEEDS_EMPTYING) {
                this.memory.labNeeds.shift();
            }

            if (this.store.getUsedCapacity(this.memory.labNeeds[0]?.resource)) {
                const nextNeed = this.memory.labNeeds[0];
                const targetLab: StructureLab = Game.getObjectById(nextNeed.lab);
                if (!this.pos.isNearTo(targetLab)) {
                    this.travelTo(targetLab, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                } else {
                    const amountToTransfer = Math.min(nextNeed.amount, this.store[nextNeed.resource]);
                    let result = this.transfer(targetLab, nextNeed.resource, Math.min(nextNeed.amount, this.store[nextNeed.resource]));
                    if (result === OK) {
                        const labTaskId = targetLab.taskId;
                        const needIndex = this.homeroom.memory.labTasks[labTaskId].needs.findIndex((need) => need.resource === nextNeed.resource);
                        if (needIndex > -1) {
                            this.homeroom.memory.labTasks[labTaskId].needs[needIndex].amount -= amountToTransfer;
                            this.memory.labNeeds[0].amount -= amountToTransfer;
                            if (this.memory.labNeeds[0].amount <= 0) {
                                this.memory.labNeeds.shift();
                                if (this.store.getUsedCapacity() - amountToTransfer === 0) {
                                    this.memory.gatheringLabResources = true;
                                }
                            }
                        }
                    }

                    if (!this.memory.labNeeds.length) {
                        delete this.memory.gatheringLabResources;
                    }
                }
            } else {
                this.memory.gatheringLabResources = true;
            }
        }
    }

    protected claimLabRequests() {
        let availableCapacity = this.store.getFreeCapacity();
        const needs: LabNeed[] = _.flatten(
            Object.values(this.homeroom.memory.labTasks)
                .filter((task) => [TaskStatus.PREPARING, TaskStatus.ACTIVE].includes(task.status))
                .map((task) => task.needs)
        ).filter((need) => need.amount > 0);
        let i: number;
        for (i = 0; availableCapacity > 0 && i < needs.length; i++) {
            availableCapacity -= needs[i].amount;
        }

        this.memory.labNeeds = needs;
        this.memory.gatheringLabResources = true;
    }

    protected onTaskFinished(): void {
        this.previousTargetId = this.memory.targetId;
        delete this.memory.currentTaskPriority;
        delete this.memory.targetId;
    }
}
