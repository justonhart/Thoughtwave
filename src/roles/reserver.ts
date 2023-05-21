import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Reserver extends WaveCreep {
    protected run() {
        if (!Memory.remoteData[this.memory.assignment]) return (this.memory.recycle = true);

        if (Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        if (!this.memory.destination) {
            const targetRoom = Game.rooms[this.memory.assignment];
            if (targetRoom || this.travelToRoom(this.memory.assignment) === IN_ROOM) {
                this.memory.destination = targetRoom.controller.pos.toMemSafe();
            }
        } else {
            let targetPos = this.memory.destination.toRoomPos();
            if (!this.pos.isNearTo(targetPos)) {
                this.travelTo(targetPos, { range: 1 });
                return;
            }

            if (
                (this.room.controller?.reservation?.username && this.room.controller?.reservation?.username !== this.owner.username) ||
                (this.room.controller?.owner && this.room.controller?.owner?.username !== this.owner.username)
            ) {
                Memory.remoteData[this.memory.assignment].reservationState = RemoteRoomReservationStatus.ENEMY;
                switch (this.attackController(this.room.controller)) {
                    case ERR_NOT_IN_RANGE:
                        this.travelTo(this.room.controller, { range: 1 });
                        break;
                }
            } else {
                // Set Controller reservation state for better spawning
                if (!this.room.controller.reservation?.ticksToEnd || this.room.controller.reservation.ticksToEnd < 1000) {
                    Memory.remoteData[this.memory.assignment].reservationState = RemoteRoomReservationStatus.LOW;
                } else if (this.room.controller.reservation.ticksToEnd > 4500) {
                    Memory.remoteData[this.memory.assignment].reservationState = RemoteRoomReservationStatus.STABLE;
                }

                if (!this.pos.isNearTo(this.room.controller)) {
                    this.travelTo(this.room.controller);
                } else {
                    if (Memory.remoteData[this.memory.assignment].structuresCleared === false) {
                        this.claimController(this.room.controller);
                        Memory.rooms[this.room.name] = { roomType: RoomType.REMOTE_MINING };
                    } else {
                        this.reserveController(this.room.controller);
                    }
                }
            }
        }
    }
}
