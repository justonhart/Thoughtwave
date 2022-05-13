import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Reserver extends WaveCreep {
    public run() {
        if (Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment]?.state === RemoteMiningRoomState.ENEMY) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        // Go to the target room
        if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
            if (this.room.controller?.reservation?.username !== this.homeroom.controller.owner.username) {
                switch (this.attackController(this.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        this.travelTo(this.room.controller, { range: 1 });
                        break;
                }
            } else {
                // Set Controller reservation state for better spawning
                if (!this.room.controller.reservation?.ticksToEnd || this.room.controller.reservation.ticksToEnd < 1000) {
                    this.homeroom.memory.remoteAssignments[this.room.name].controllerState = RemoteMiningRoomControllerState.LOW;
                } else if (this.room.controller.reservation.ticksToEnd > 4500) {
                    this.homeroom.memory.remoteAssignments[this.room.name].controllerState = RemoteMiningRoomControllerState.STABLE;
                }

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
