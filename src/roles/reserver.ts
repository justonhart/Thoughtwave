import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Reserver extends WaveCreep {
    public run() {
        // Go to the target room
        if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
            if (!this.room.controller.my && this.room.controller?.owner?.username === 'Invader') {
                switch (this.attackController(this.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        this.travelTo(this.room.controller, { range: 1 });
                        break;
                }
            } else {
                // Reserve Controller in target room
                switch (this.reserveController(this.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        this.travelTo(this.room.controller, { range: 1 });
                        break;
                }
            }
        }
    }
}
