import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    protected run() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (this.memory.preparingLabs) {
            //this.prepareLabs();
        } else if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer) {
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

        //@ts-ignore
        let containers: StructureContainer[] = room
            .find(FIND_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_CONTAINER && structure.store.getUsedCapacity());
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
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone): void {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        //@ts-ignore
        let resourceToWithdraw: ResourceConstant = Object.keys(target.store).shift();
        let result = this.withdraw(target, resourceToWithdraw);
        switch (result) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 1 });
                break;
            case 0:
                if (Object.keys(target.store).length === 1 || target.store[resourceToWithdraw] >= this.store.getFreeCapacity()) {
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

    // protected prepareLabs() {

    //     let preparingTaskIndex = this.room.memory.labTasks.findIndex((task) => task.primaryLab === this.memory.targetId);
    //     if (preparingTaskIndex > -1) {
    //         let task = this.room.memory.labTasks[preparingTaskIndex];

    //         switch (task.type) {
    //             case LabTaskType.BOOST:
    //                 let primaryLab = Game.getObjectById(task.primaryLab);

    //                 let labHasAllResources = task.reagentsNeeded
    //                     .map((need) => primaryLab.store[need.resource] >= need.amount)
    //                     .reduce((allNeedsFulfilled, next) => allNeedsFulfilled && next);

    //                 if (labHasAllResources) {
    //                     task.status = TaskStatus.WAITING;
    //                     this.clearLabTaskMemoryValues();
    //                 } else {

    //                     // identify next needed resource AND amount, and get resource if available
    //                     let resourceNeeded = task.reagentsNeeded[0].resource;
    //                     let amountNeeded = task.reagentsNeeded[0].amount - primaryLab.store[resourceNeeded];
    //                     console.log(`${amountNeeded} ${resourceNeeded} needed`)
    //                     if(!this.memory.resourceSource){
    //                         let resourceSource = this.room.storage?.store[resourceNeeded] ?
    //                             this.room.storage.id :
    //                             this.room.terminal?.store[resourceNeeded] ?
    //                                 this.room.terminal.id :
    //                                 undefined;

    //                         if(resourceSource){
    //                             this.memory.resourceSource = resourceSource;
    //                         } else {
    //                             //if no source found, room doesn't have necessary resouces - we shouldn't be creaing jobs we don't have the resources for
    //                             task.status = TaskStatus.CLEANUP;
    //                             this.clearLabTaskMemoryValues();
    //                         }
    //                     }

    //                     let resourceSource = Game.getObjectById(this.memory.resourceSource);
    //                     if(this.store[resourceNeeded] >= amountNeeded){
    //                         if(!this.pos.isNearTo(primaryLab)){
    //                             this.travelTo(primaryLab);
    //                         } else {
    //                             let result = this.transfer(primaryLab, resourceNeeded, amountNeeded);
    //                             if(result === OK){

    //                                 if(this.store[resourceNeeded] + primaryLab.store[resourceNeeded] === amountNeeded){
    //                                     delete this.memory.resourceSource;

    //                                     //doublecheck resources to see if any more are needed
    //                                     labHasAllResources = task.reagentsNeeded.filter(entry => entry.resource !== resourceNeeded)
    //                                         .map((need) => primaryLab.store[need.resource] >= need.amount)
    //                                         .reduce((allNeedsFulfilled, next) => allNeedsFulfilled && next);

    //                                     if(labHasAllResources){
    //                                         task.status = TaskStatus.WAITING;
    //                                         this.clearLabTaskMemoryValues();
    //                                     }
    //                                 }
    //                             }
    //                         }
    //                     } else {
    //                         if(!this.pos.isNearTo(resourceSource)){
    //                             this.travelTo(resourceSource);
    //                         } else {
    //                             this.withdraw(resourceSource, resourceNeeded, amountNeeded);
    //                         }
    //                     }
    //                 }

    //                 break;
    //         }

    //         this.room.memory.labTasks[preparingTaskIndex] = task;
    //     } else {
    //         this.clearLabTaskMemoryValues();
    //     }
    // }

    private clearLabTaskMemoryValues() {
        delete this.memory.preparingLabs;
        delete this.memory.targetId;
    }
}
