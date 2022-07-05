import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Operative extends WorkerCreep {
    protected run() {
        if (!this.operation) {
            delete this.memory.operation;
            delete this.memory.destination;
        }

        switch (this.memory.operation) {
            case OperationType.STERILIZE:
                this.runSterilize();
                break;
            case OperationType.COLLECTION:
                this.runCollect();
                break;
            case OperationType.UPGRADE_BOOST:
                this.runUpgradeBoost();
                break;
            case OperationType.REMOTE_BUILD:
                this.runRemoteBuild();
                break;
            case OperationType.CLEAN:
                this.runClean();
                break;
        }
    }

    private runUpgradeBoost() {
        if (Game.rooms[this.memory.destination].controller.level < 6) {
            if (this.store.energy) {
                let controller = Game.rooms[this.memory.destination].controller;
                if (this.pos.inRangeTo(controller, 3)) {
                    this.upgradeController(controller);
                } else {
                    this.travelTo(controller, { range: 3 });
                }
            } else {
                this.gatherResourceFromOrigin(RESOURCE_ENERGY);
            }
        } else {
            this.terminateOperation();
        }
    }

    private runRemoteBuild() {
        if (this.store.energy) {
            let constructionSite = Game.rooms[this.memory.destination]
                .find(FIND_MY_CONSTRUCTION_SITES)
                .reduce((mostProgressed, next) => (mostProgressed.progress > next.progress ? mostProgressed : next));
            if (constructionSite) {
                if (this.pos.inRangeTo(constructionSite, 3)) {
                    this.build(constructionSite);
                } else {
                    this.travelTo(constructionSite, { range: 3 });
                }
            } else {
                this.terminateOperation();
            }
        } else {
            this.gatherResourceFromOrigin(RESOURCE_ENERGY);
        }
    }

    private runClean() {
        if (!this.memory.targetId) {
            if (this.pos.roomName === this.memory.destination) {
                let target = this.findCleanTarget();
                if (!target) {
                    this.terminateOperation();
                } else {
                    this.memory.targetId = target;
                }
            } else {
                this.travelToRoom(this.memory.destination);
            }
        } else {
            let target = Game.getObjectById(this.memory.targetId) as Structure;
            if (target) {
                if (this.pos.isNearTo(target)) {
                    this.dismantle(target);
                } else {
                    this.travelTo(target, { range: 1 });
                }
            } else {
                this.memory.targetId = this.findCleanTarget();
            }
        }
    }

    private runSterilize() {
        if (this.travelToRoom(this.memory.destination, { range: 20 }) === IN_ROOM) {
            //@ts-expect-error
            let target: Structure = Game.getObjectById(this.memory.targetId);
            if (!target) {
                this.memory.targetId = this.findSterilizeTarget();
                target = Game.getObjectById(this.memory.targetId);
            }

            if (target) {
                this.runHardDismantleJob(target);
            } else {
                delete this.memory.targetId;
                this.terminateOperation();
            }
        }
    }

    private findSterilizeTarget(): Id<Structure> {
        let target = this.room.find(FIND_HOSTILE_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_SPAWN);
        return target?.id;
    }

    private runCollect() {
        if (this.store.getUsedCapacity()) {
            let storage = Game.rooms[this.operation.originRoom].storage;
            if (this.pos.isNearTo(storage)) {
                this.transfer(storage, Object.keys(this.store).pop() as ResourceConstant);
            } else {
                this.travelTo(storage);
            }
        } else if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
            //cast target to storage for store property
            let target: StructureStorage = Game.getObjectById(this.memory.targetId) as StructureStorage;
            if (!target) {
                this.memory.targetId = this.findCollectionTarget();
                target = Game.getObjectById(this.memory.targetId) as StructureStorage;
            }

            if (target) {
                if (this.pos.isNearTo(target)) {
                    let resourceToWithdraw = this.operation.resource ?? (Object.keys(target.store)[0] as ResourceConstant);
                    this.withdraw(target, resourceToWithdraw);
                    delete this.memory.targetId;
                } else {
                    this.travelTo(target);
                }
            } else {
                delete this.memory.targetId;
                this.terminateOperation();
            }
        }
    }

    private findCollectionTarget(): Id<Structure> {
        return this.room
            .find(FIND_STRUCTURES)
            .find(
                (struct) =>
                    (struct.structureType === STRUCTURE_STORAGE || struct.structureType === STRUCTURE_TERMINAL) &&
                    (this.operation.resource ? struct.store[this.operation.resource] : struct.store.getUsedCapacity())
            )?.id;
    }

    private findCleanTarget(): Id<Structure> {
        let destinationRoom = Game.rooms[this.memory.destination];

        let targets = destinationRoom.find(FIND_HOSTILE_STRUCTURES, {
            filter: (struct) =>
                !((struct.structureType === STRUCTURE_STORAGE || struct.structureType === STRUCTURE_TERMINAL) && struct.store.getUsedCapacity()) &&
                !(struct.structureType === STRUCTURE_LAB && struct.mineralType) &&
                !(struct.structureType === STRUCTURE_NUKER && (struct.store.energy || struct.store.G)),
        });

        return this.pos.findClosestByRange(targets)?.id;
    }

    private terminateOperation() {
        let opIndex = Memory.empire.operations.findIndex((op) => op.targetRoom === this.memory.destination && op.type === this.memory.operation);
        if (opIndex > -1) {
            Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE;
        }

        delete this.memory.destination;
        delete this.memory.operation;
    }

    private gatherResourceFromOrigin(resource: ResourceConstant) {
        let origin = Game.rooms[this.operation.originRoom];
        if (!this.pos.isNearTo(origin.storage)) {
            this.travelTo(origin.storage);
        } else {
            this.withdraw(origin.storage, resource);
        }
    }
}
