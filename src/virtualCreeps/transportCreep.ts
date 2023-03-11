import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    private previousTargetId: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> | Id<Mineral>;
    protected incomingResourceAmount: number = 0; // Picked up energy in same tick to do proper retargeting
    protected outgoingResourceAmount: number = 0; // Dropped off energy in the same tick to do proper retargeting
    protected actionTaken: boolean = false;
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
        if (!target && !this.memory.labRequests?.length) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (this.memory.labRequests?.length) {
            this.prepareLabs();
        } else {
            this.runNonLabPrepTasks();

            //round 2
            if (!this.memory.targetId) {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);

                if (this.memory.labRequests?.length) {
                    this.prepareLabs();
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
        } else if (target instanceof Tombstone || target instanceof StructureContainer || target?.status === LabStatus.NEEDS_EMPTYING) {
            if (
                target instanceof StructureContainer &&
                this.homeroom.memory.layout === RoomLayout.STAMP &&
                this.homeroom.stamps.container.some(
                    (containerStamp) =>
                        containerStamp.type === 'center' && containerStamp.pos.x === target.pos.x && containerStamp.pos.y === target.pos.y
                )
            ) {
                this.runRefillDropJob(target);
            } else {
                this.runCollectionJob(target);
            }
        } else if (
            target instanceof StructureSpawn ||
            target instanceof StructureExtension ||
            target instanceof StructureTower ||
            target instanceof StructureLab
        ) {
            this.runRefillJob(target);
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
        }
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
                this.travelTo(target, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingResourceAmount });
            } else if (!this.actionTaken) {
                let result = this.withdraw(target, RESOURCE_ENERGY);
                switch (result) {
                    case 0:
                        // @ts-ignore
                        this.incomingResourceAmount += Math.min(this.store.getFreeCapacity(), target.store.energy);
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
                this.travelTo(target, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingResourceAmount });
            } else if (!this.actionTaken) {
                switch (this.pickup(target)) {
                    case 0:
                        this.incomingResourceAmount += Math.min(this.store.getFreeCapacity(), target.amount);
                        this.actionTaken = true;
                    case ERR_FULL:
                        this.stopGathering();
                        break;
                }
            }

            return;
        }
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

        const looseEnergyStacks = this.room
            .find(FIND_DROPPED_RESOURCES)
            .filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount >= this.store.getCapacity());
        let containers = this.room.find(FIND_STRUCTURES).filter((str) => {
            let isAllowedStampContainer = true;
            // In Stamps do not allow retrieving energy from center/rm containers or miner containers with links
            if (this.room.memory.layout === RoomLayout.STAMP) {
                const container = this.room.stamps.container.find(
                    (containerStamp) => str.pos.x === containerStamp.pos.x && str.pos.y === containerStamp.pos.y
                );
                if (container && container.type?.includes('miner') && container.type !== 'mineral') {
                    isAllowedStampContainer = !this.room.stamps.link.some(
                        (linkStamp) =>
                            linkStamp.type === container.type &&
                            linkStamp.pos.lookFor(LOOK_STRUCTURES).some((lookStr) => lookStr.structureType === STRUCTURE_LINK)
                    );
                } else {
                    isAllowedStampContainer = false;
                }
            }
            return (
                str.structureType === STRUCTURE_CONTAINER &&
                (str.store.energy >= this.store.getCapacity() || this.room.controller?.level < 5) &&
                isAllowedStampContainer
            );
        });

        // If there are multiple containers and one is full while the other one isnt then prioritize that one
        if (
            containers.length > 1 &&
            containers.some((container: StructureContainer) => !container.store.getFreeCapacity()) &&
            containers.some((container: StructureContainer) => container.store.getFreeCapacity())
        ) {
            containers = containers.filter((container: StructureContainer) => !container.store.getFreeCapacity());
        }

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
            this.travelTo(this.homeroom.storage, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingResourceAmount });
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
        const towers = this.homeroom
            .find(FIND_MY_STRUCTURES)
            .filter(
                (structure) => structure.structureType === STRUCTURE_TOWER && this.previousTargetId !== structure.id && structure.store.energy < 900
            ) as StructureTower[];
        if (towers.some((tower) => tower.store.energy < 300)) {
            return this.pos.findClosestByPath(
                towers.filter((tower) => tower.store.energy < 300),
                { ignoreCreeps: true }
            ).id;
        }

        let labs = this.homeroom
            .find(FIND_MY_STRUCTURES)
            .filter(
                (structure) =>
                    structure.structureType === STRUCTURE_LAB &&
                    this.previousTargetId !== structure.id &&
                    structure.store.energy < structure.store.getCapacity(RESOURCE_ENERGY)
            );
        if (labs.length) {
            return this.pos.findClosestByPath(labs, { ignoreCreeps: true }).id;
        }

        let targetStructureTypes: string[] = [STRUCTURE_EXTENSION, STRUCTURE_SPAWN];
        const hasManager = this.homeroom.creeps.some((creep) => creep.memory.role === Role.MANAGER);
        if (this.homeroom.memory.layout === RoomLayout.STAMP && hasManager) {
            targetStructureTypes = [STRUCTURE_EXTENSION];
            // Make Distributor fill up center containers as long as there is no center link yet
            if (
                !this.homeroom.stamps.link.some(
                    (linkStamp) =>
                        linkStamp.type === 'center' &&
                        linkStamp.rcl <= this.homeroom.controller.level &&
                        !this.homeroom.lookForAt(LOOK_STRUCTURES, linkStamp.pos).some((structure) => structure.structureType === STRUCTURE_LINK)
                )
            ) {
                targetStructureTypes.push(STRUCTURE_CONTAINER);
            }
        }
        let spawnStructures = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                targetStructureTypes.includes(structure.structureType) &&
                this.previousTargetId !== structure.id &&
                // @ts-ignore
                structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY) &&
                // Do not fill up center or miner extensions
                (this.homeroom.memory.layout !== RoomLayout.STAMP ||
                    !hasManager ||
                    structure.structureType !== STRUCTURE_EXTENSION ||
                    !this.homeroom.stamps.extension.some(
                        (extensionStamp) =>
                            extensionStamp.pos.x === structure.pos.x &&
                            extensionStamp.pos.y === structure.pos.y &&
                            (extensionStamp.type === 'center' || extensionStamp.type?.includes('miner'))
                    )) &&
                // Fill up center containers
                (structure.structureType !== STRUCTURE_CONTAINER ||
                    this.homeroom.stamps.container.some(
                        (containerStamp) =>
                            containerStamp.pos.x === structure.pos.x && containerStamp.pos.y === structure.pos.y && containerStamp.type === 'center'
                    ))
        ) as AnyStructure[];

        if (spawnStructures.length) {
            // Switch between containers which is important in early rcl
            if (this.homeroom.memory.layout === RoomLayout.STAMP && hasManager && this.homeroom.controller.level < 5) {
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

        // Now fill them completely
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> | Id<Tombstone> {
        let room = this.homeroom;
        if (roomName) {
            room = Game.rooms[roomName];
        }
        if (!room) {
            return undefined;
        }

        const labsNeedingEmptied = this.room.labs?.filter((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
        if (labsNeedingEmptied.length) {
            return this.pos.findClosestByRange(labsNeedingEmptied).id;
        }

        const containers: StructureContainer[] = room
            .find(FIND_STRUCTURES)
            .filter(
                (structure) =>
                    structure.structureType === STRUCTURE_CONTAINER &&
                    structure.store.getUsedCapacity() &&
                    (room.memory.layout !== RoomLayout.STAMP ||
                        room.stamps.container.some(
                            (containerStamp) =>
                                containerStamp.type !== 'mineral' &&
                                containerStamp.type?.includes('miner') &&
                                containerStamp.pos.x === structure.pos.x &&
                                containerStamp.pos.y === structure.pos.y
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
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage | StructureLab) {
        this.memory.currentTaskPriority = Priority.HIGH;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { range: 1, currentTickEnergy: this.incomingResourceAmount });
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
                        if (target.store.getFreeCapacity(RESOURCE_ENERGY) >= this.store.energy) {
                            this.memory.gathering = true;
                        }
                        break;
                }
            }
        } else {
            this.onTaskFinished();
        }
    }

    protected runRefillDropJob(target: StructureContainer) {
        this.memory.currentTaskPriority = Priority.HIGH;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (this.pos.x !== target.pos.x || this.pos.y !== target.pos.y) {
                this.travelTo(target, { range: 0, currentTickEnergy: this.incomingResourceAmount });
            } else if (!this.actionTaken) {
                this.drop(RESOURCE_ENERGY, Math.min(this.store.energy, targetFreeCapacity));
                this.outgoingResourceAmount += Math.min(this.store.energy, targetFreeCapacity);
                this.actionTaken = true;
                if (target.store.getFreeCapacity(RESOURCE_ENERGY) >= this.store.energy) {
                    this.memory.gathering = true;
                }
                this.onTaskFinished();
            }
        } else {
            this.onTaskFinished();
        }
    }

    //gather resources for the purpose of storing
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone | StructureLab): void {
        this.memory.currentTaskPriority = Priority.HIGH;

        let resourcesToWithdraw = target instanceof StructureLab ? [target.mineralType] : (Object.keys(target.store) as ResourceConstant[]);
        let nextResource: ResourceConstant = resourcesToWithdraw.shift();
        if (!this.pos.isNearTo(target)) {
            this.travelTo(target, { range: 1, currentTickEnergy: this.incomingResourceAmount });
        } else if (!this.actionTaken) {
            let result = this.withdraw(target, nextResource);
            switch (result) {
                case 0:
                    this.actionTaken = true;
                    if (target.store[nextResource] >= this.store.getFreeCapacity() || target instanceof StructureLab) {
                        this.onTaskFinished();
                    }
                    this.incomingResourceAmount += Math.min(this.store.getFreeCapacity(), target.store[nextResource]);
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
            this.travelTo(resource, { range: 1, currentTickEnergy: this.incomingResourceAmount });
        } else if (!this.actionTaken) {
            let result = this.pickup(resource);
            switch (result) {
                case 0:
                    this.actionTaken = true;
                    this.incomingResourceAmount += resource.amount;
                case ERR_FULL:
                    this.onTaskFinished();
            }
        }
    }

    protected prepareLabs() {
        this.memory.currentTaskPriority = Priority.HIGH;
        let requests = this.memory.labRequests;

        if (this.memory.gatheringLabResources) {
            let resourceList: { [resource: string]: number } = {};
            requests.forEach((req) => {
                !resourceList[req.resource] ? (resourceList[req.resource] = req.amount) : (resourceList[req.resource] += req.amount);
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
                    delete this.memory.labRequests;
                } else if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1, currentTickEnergy: this.incomingResourceAmount });
                } else {
                    let amountToWithdraw = Math.min(resourceList[resourceToGather] - this.store[resourceToGather], this.store.getFreeCapacity());
                    let result = this.withdraw(target, resourceToGather, Math.min(amountToWithdraw, target.store[resourceToGather]));
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
            if (this.store.getUsedCapacity(this.memory.labRequests[0]?.resource)) {
                let deliveryTarget = Game.getObjectById(requests[0].lab);
                if (!this.pos.isNearTo(deliveryTarget)) {
                    this.travelTo(deliveryTarget, { range: 1, currentTickEnergy: this.incomingResourceAmount });
                } else {
                    let result = this.transfer(deliveryTarget, requests[0].resource, Math.min(requests[0].amount, this.store[requests[0].resource]));
                    if (result === OK) {
                        requests[0].amount -= Math.min(requests[0].amount, this.store[requests[0].resource]);
                        if (requests[0].amount <= 0) {
                            requests.shift();
                            this.memory.gatheringLabResources = true;
                        }
                    }

                    if (!requests.length) {
                        delete this.memory.gatheringLabResources;
                    }

                    this.memory.labRequests = requests;
                }
            } else {
                this.memory.gatheringLabResources = true;
            }
        }
    }

    protected claimLabRequests() {
        let availableCapacity = this.store.getFreeCapacity();
        let i: number;
        for (i = 0; availableCapacity > 0 && i < this.homeroom.memory.labRequests.length; i++) {
            availableCapacity -= this.homeroom.memory.labRequests[i].amount;
        }

        this.memory.labRequests = this.homeroom.memory.labRequests.splice(0, i);
        this.memory.gatheringLabResources = true;
    }

    protected onTaskFinished(): void {
        this.previousTargetId = this.memory.targetId;
        delete this.memory.currentTaskPriority;
        delete this.memory.targetId;
    }
}
