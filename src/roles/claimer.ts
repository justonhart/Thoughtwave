import { getUsername } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    memory: ClaimerMemory;
    operation: ColonizeOperation;
    protected run() {
        if (!this.operation) {
            this.memory.recycle = true;
        }
        if (this.room.name === this.operation.targetRoom) {
            const controller = this.room.controller;
            if (controller) {
                if (!controller.my) {
                    if (!this.pos.isNearTo(controller)) {
                        this.travelTo(controller, { range: 1 });
                    } else {
                        if (controller?.reservation && controller.reservation.username !== getUsername()) {
                            this.attackController(controller);
                        } else {
                            let result = this.claimController(controller);
                        }
                    }
                }
            }
        } else {
            this.travelToRoom(this.operation.targetRoom, { allowedRooms: this.operation.pathRooms });
        }
    }
}
