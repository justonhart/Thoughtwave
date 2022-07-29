import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    private previousTargetId: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin>;
    protected incomingResourceAmount: number = 0;
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
            this.runCollectionJob(target);
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
        this.memory.currentTaskPriority = Priority.MEDIUM;

        let target = Game.getObjectById(this.memory.energySource);
        if (!target) {
            this.memory.energySource = this.findEnergySource();
            target = Game.getObjectById(this.memory.energySource);
        }

        if (target instanceof Structure || target instanceof Ruin) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { ignoreCreeps: true, range: 1 });
            } else if (!this.actionTaken) {
                let result = this.withdraw(target, RESOURCE_ENERGY);
                switch (result) {
                    case 0:
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
                this.travelTo(target, { ignoreCreeps: true, range: 1 });
            } else if (!this.actionTaken) {
                switch (this.pickup(target)) {
                    case 0:
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
        if (this.room.storage?.store[RESOURCE_ENERGY]) {
            return this.room.storage.id;
        }

        let nonStorageSources: (Ruin | Resource | Structure)[];

        let ruins = this.room.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });

        let looseEnergyStacks = this.room
            .find(FIND_DROPPED_RESOURCES)
            .filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount >= this.store.getCapacity());

        let containers = this.room
            .find(FIND_STRUCTURES)
            .filter((str) => str.structureType === STRUCTURE_CONTAINER && str.store.energy >= this.store.getCapacity());

        nonStorageSources = [...ruins, ...looseEnergyStacks, ...containers];
        if (nonStorageSources.length) {
            return this.pos.findClosestByRange(nonStorageSources).id;
        }
    }

    protected stopGathering() {
        this.memory.gathering = false;
        delete this.memory.energySource;
    }

    protected storeCargo() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let resourceToStore: any = Object.keys(this.store).shift();
        if (!this.pos.isNearTo(this.homeroom.storage)) {
            this.travelTo(this.homeroom.storage, { ignoreCreeps: true, range: 1 });
        } else if (!this.actionTaken) {
            let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
            switch (storeResult) {
                case ERR_NOT_IN_RANGE:
                    break;
                case 0:
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
        let towers = this.homeroom
            .find(FIND_MY_STRUCTURES)
            .filter(
                (structure) =>
                    structure.structureType === STRUCTURE_TOWER && this.previousTargetId !== structure.id && structure.store[RESOURCE_ENERGY] < 700
            );
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }

        let spawnStructures = this.homeroom.find(FIND_MY_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(structure.structureType) &&
                this.previousTargetId !== structure.id &&
                // @ts-ignore
                structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
        );

        if (spawnStructures.length) {
            return this.pos.findClosestByPath(spawnStructures, { ignoreCreeps: true }).id;
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
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> | Id<Tombstone> {
        let room = this.homeroom;
        if (roomName) {
            room = Game.rooms[roomName];
        }
        if (!room) {
            return undefined;
        }

        let labsNeedingEmptied = this.room.labs?.filter((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
        if (labsNeedingEmptied.length) {
            return this.pos.findClosestByRange(labsNeedingEmptied).id;
        }

        let containers: StructureContainer[] = room
            .find(FIND_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_CONTAINER && structure.store.getUsedCapacity()) as StructureContainer[];
        let fillingContainers = containers.filter((container) => container.store.getUsedCapacity() >= container.store.getCapacity() / 2);
        if (fillingContainers.length) {
            return fillingContainers.reduce((fullestContainer, nextContainer) =>
                fullestContainer.store.getUsedCapacity() > nextContainer.store.getUsedCapacity() ? fullestContainer : nextContainer
            ).id;
        }

        let looseResources = room.find(FIND_DROPPED_RESOURCES);
        if (looseResources.filter((r) => r.amount > 100).length) {
            return looseResources.reduce((biggestResource, resourceToCompare) =>
                biggestResource.amount > resourceToCompare.amount ? biggestResource : resourceToCompare
            ).id;
        }

        let tombstonesWithResources = room.find(FIND_TOMBSTONES).filter((t) => t.store.getUsedCapacity() > this.store.getCapacity() / 2);
        if (tombstonesWithResources.length) {
            return this.pos.findClosestByPath(tombstonesWithResources, { ignoreCreeps: true, range: 1 }).id;
        }

        if (containers.length) {
            return containers.reduce((fullestContainer, nextContainer) =>
                fullestContainer.store.getUsedCapacity() > nextContainer.store.getUsedCapacity() ? fullestContainer : nextContainer
            ).id;
        }

        if (looseResources.length) {
            return looseResources.reduce((most, next) => (most.amount > next.amount ? most : next)).id;
        }
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage | StructureLab) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { range: 1 });
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

    //gather resources for the purpose of storing
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone | StructureLab): void {
        this.memory.currentTaskPriority = Priority.MEDIUM;

        let resourcesToWithdraw = target instanceof StructureLab ? [target.mineralType] : (Object.keys(target.store) as ResourceConstant[]);
        let nextResource: ResourceConstant = resourcesToWithdraw.shift();
        if (!this.pos.isNearTo(target)) {
            this.travelTo(target, { range: 1 });
        } else if (!this.actionTaken) {
            let result = this.withdraw(target, nextResource);
            switch (result) {
                case 0:
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
        this.memory.currentTaskPriority = Priority.MEDIUM;
        if (!this.pos.isNearTo(resource)) {
            this.travelTo(resource, { range: 1 });
        } else if (!this.actionTaken) {
            let result = this.pickup(resource);
            switch (result) {
                case 0:
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
                    this.travelTo(target, { range: 1 });
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
            if (this.store.getUsedCapacity()) {
                let deliveryTarget = Game.getObjectById(requests[0].lab);
                if (!this.pos.isNearTo(deliveryTarget)) {
                    this.travelTo(deliveryTarget, { range: 1 });
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
