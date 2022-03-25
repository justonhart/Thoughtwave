import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    public run() {
        const flag = Game.flags.claimer;

        if (flag) {
            // Go to the target room
            if (flag.pos.roomName !== this.pos.roomName) {
                this.travelTo(flag, { reusePath: 50, maxOps: 10000 });
            } else {
                // Claim Controller in target room
                switch (this.claimController(this.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        this.travelTo(this.room.controller, { range: 1 });
                        break;
                    case OK:
                        Game.flags.claimer.name = 'colonizer'; // Send colonizer next
                        console.log(`§{this.room.name} has been claimed! Time to die.`);
                        this.suicide();
                        break;
                }
            }
        }
    }
}
