import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    protected run() {
        if (this.room.name === this.operation.targetRoom) {
            const controller = this.room.controller;
            if (controller) {
                if (!controller.my) {
                    if (!this.pos.isNearTo(controller)) {
                        this.travelTo(controller);
                    } else {
                        this.claimController(controller);
                    }
                }
            }
        } else {
            this.travelToRoom(this.operation.targetRoom);
        }
    }
}
