import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    public run() {
        let claimOpExists = Memory.empire.colonizationOperations.some((op) => op.destination === this.memory.destination);
        if (!claimOpExists) {
            console.log(`No colonize operation found for ${this.name}. Terminating.`);
            this.suicide();
        }

        // Go to the target room
        if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
            if (this.room.controller.my) {
                console.log(`${this.room.name} has been claimed!`);
                let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
                if (opIndex) {
                    Memory.empire.colonizationOperations[opIndex].stage = this.room.canSpawn() ? ColonizeStage.COMPLETE : ColonizeStage.BUILD;
                }
                this.suicide();
            } else {
                // Claim Controller in target room
                switch (this.claimController(this.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        this.travelTo(this.room.controller, { range: 1, swampCost: 1 });
                        break;
                    case ERR_INVALID_TARGET:
                    case OK:
                        break;
                }
            }
        }
    }
}
