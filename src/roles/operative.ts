import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Operative extends WorkerCreep {
    public run() {
        switch (this.memory.operation) {
            case OperationType.STERILIZE:
                this.runSterilize();
        }
    }

    private runSterilize() {
        if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
            if (!this.memory.targetId) {
                this.memory.targetId = this.findSterilizeTarget();
            }

            //@ts-expect-error
            let target: Structure = Game.getObjectById(this.memory.targetId);

            if (target) {
                this.runHardDismantleJob(target);
            } else {
                this.terminateOperation();
            }
        }
    }

    private findSterilizeTarget(): Id<Structure> {
        let target = this.room.find(FIND_HOSTILE_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_SPAWN);
        return target?.id;
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
