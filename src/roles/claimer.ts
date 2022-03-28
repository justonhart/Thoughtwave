import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    public run() {
        let destination = Game.rooms[this.memory.destination];

        // Go to the target room
        if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
            // Claim Controller in target room
            switch (this.claimController(this.room.controller)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.room.controller, { range: 1, swampCost: 1 });
                    break;
                case ERR_INVALID_TARGET:
                case OK:
                    console.log(`${this.room.name} has been claimed!`);

                    let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
                    Memory.empire.colonizationOperations[opIndex].stage = ColonizeStage.BUILD;
                    this.suicide();
                    break;
            }
        }
    }
}
