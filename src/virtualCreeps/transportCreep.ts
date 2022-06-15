import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    protected run() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (this.memory.labRequest) {
            this.prepareLab();
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

        let towers = this.homeroom
            .find(FIND_MY_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_TOWER && structure.store[RESOURCE_ENERGY] < 700);
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
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

    protected prepareLab() {
        let targetLab = Game.getObjectById(this.memory.targetId) as StructureLab;
        let request = this.memory.labRequest;

        if (request.amount > 0) {
            if (this.store[request.resource]) {
                if (!this.pos.isNearTo(targetLab)) {
                    this.travelTo(targetLab);
                } else {
                    let transferResult = this.transfer(targetLab, request.resource);
                    if (transferResult === OK) {
                        request.amount -= this.store[request.resource];
                        this.memory.labRequest = request;
                        if (request.amount <= 0) {
                            delete this.memory.labRequest;
                            delete this.memory.targetId;
                            delete this.memory.resourceSource;
                        }
                    }
                }
            } else {
                if (!this.memory.resourceSource) {
                    this.memory.resourceSource = this.room.storage?.store[request.resource]
                        ? this.room.storage.id
                        : this.room.terminal?.store[request.resource]
                        ? this.room.terminal.id
                        : undefined;
                }

                let source = Game.getObjectById(this.memory.resourceSource);
                if (source) {
                    if (!this.pos.isNearTo(source)) {
                        this.travelTo(source);
                    } else {
                        this.withdraw(source, request.resource, request.amount);
                    }
                }
            }
        } else {
            delete this.memory.labRequest;
            delete this.memory.targetId;
            delete this.memory.resourceSource;
        }
    }
}
