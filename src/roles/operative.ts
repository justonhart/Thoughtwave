import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Operative extends WorkerCreep {
    public run() {
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
            //@ts-expect-error
            let target: Structure = Game.getObjectById(this.memory.targetId);
            if (!target) {
                this.memory.targetId = this.findCollectionTarget();
                target = Game.getObjectById(this.memory.targetId);
            }

            if (target) {
                if (this.pos.isNearTo(target)) {
                    this.withdraw(target, this.operation.resource ?? RESOURCE_ENERGY);
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
                    struct.store[this.operation.resource ?? RESOURCE_ENERGY]
            )?.id;
    }

    private terminateOperation() {
        let opIndex = Memory.empire.operations.findIndex((op) => op.targetRoom === this.memory.destination && op.type === this.memory.operation);
        if (opIndex > -1) {
            Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE;
        }

        delete this.memory.destination;
        delete this.memory.operation;
    }
}
