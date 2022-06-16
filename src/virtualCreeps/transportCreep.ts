import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    protected run() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (this.memory.labRequests?.length) {
            this.prepareLabs();
        } else if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer || target?.status === LabStatus.NEEDS_EMPTYING) {
            this.runCollectionJob(target);
        } else if (
            target instanceof StructureSpawn ||
            target instanceof StructureExtension ||
            target instanceof StructureTower ||
            target instanceof StructureLab
        ) {
            if (this.store.energy) {
                this.runRefillJob(target);
            } else {
                this.gatherEnergy();
            }
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
        }
    }

    protected findTarget(): any {
        this.say('targeting');
    }

    //gather energy to distribute
    protected gatherEnergy(): void {
        if (this.homeroom.storage?.store[RESOURCE_ENERGY]) {
            let result = this.withdraw(this.homeroom.storage, RESOURCE_ENERGY);
            switch (result) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.homeroom.storage, { range: 1 });
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }
        }
    }

    protected findRefillTarget(): Id<Structure> {
        let towers = this.homeroom
            .find(FIND_MY_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_TOWER && structure.store[RESOURCE_ENERGY] < 700);
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }

        let spawnStructures = this.homeroom.find(FIND_MY_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(structure.structureType) &&
                // @ts-ignore
                structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
        );

        if (spawnStructures.length) {
            return this.pos.findClosestByPath(spawnStructures, { ignoreCreeps: true }).id;
        }

        let labs = this.homeroom
            .find(FIND_MY_STRUCTURES)
            .filter(
                (structure) => structure.structureType === STRUCTURE_LAB && structure.store.energy < structure.store.getCapacity(RESOURCE_ENERGY)
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

    //gather resources for the purpose of storing
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone | StructureLab): void {
        this.memory.currentTaskPriority = Priority.MEDIUM;

        let resourcesToWithdraw = target instanceof StructureLab ? [target.mineralType] : (Object.keys(target.store) as ResourceConstant[]);
        let nextResource: ResourceConstant = resourcesToWithdraw.shift();
        let result = this.withdraw(target, nextResource);
        switch (result) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 1 });
                break;
            case 0:
                if (resourcesToWithdraw.length === 1 || target.store[nextResource] >= this.store.getFreeCapacity()) {
                    this.onTaskFinished();
                }
                break;
            default:
                this.onTaskFinished();
                break;
        }
    }

    protected runPickupJob(resource: Resource): void {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        switch (this.pickup(resource)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(resource, { range: 1 });
                break;
            case 0:
            case ERR_FULL:
                this.onTaskFinished();
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
                if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1 });
                } else {
                    let amountToWithdraw = Math.min(resourceList[resourceToGather] - this.store[resourceToGather], this.store.getFreeCapacity());
                    this.withdraw(target, resourceToGather, amountToWithdraw);
                    if (amountToWithdraw + this.store.getUsedCapacity() >= totalAmountToGather) {
                        this.memory.gatheringLabResources = false;
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
}
