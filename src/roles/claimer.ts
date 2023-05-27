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
                        this.travelTo(controller);
                    } else {
                        if (controller?.reservation) {
                            this.attackController(controller);
                        } else {
                            let result = this.claimController(controller);
                            if (result === OK) {
                                this.room.memory = {
                                    roomType: this.memory.claimRoomType,
                                };
                            }
                        }
                    }
                }
            }
        } else {
            this.travelToRoom(this.operation.targetRoom, { allowedRooms: this.operation.pathRooms });
        }
    }
}
