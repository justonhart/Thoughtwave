import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Sentry extends WaveCreep {
    protected run() {
        const targetRoom = Game.rooms[this.memory.assignment];
        if (this.travelToRoom(this.memory.assignment) !== IN_ROOM) {
            return;
        }

        const hostileCreeps = this.room.hostileCreeps.filter((creep) => creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK));
        const centerRoomPos = new RoomPosition(25, 25, targetRoom.name);
        if (hostileCreeps.length) {
            return this.travelTo(hostileCreeps[0], {
                goals: hostileCreeps.map((creep) => ({ pos: creep.pos, range: 7 })),
                reusePath: 0,
                range: 8,
                flee: true,
                exitCost: 10,
                maxRooms: 1,
            });
        } else {
            // Wait inside the room away from all exits
            this.travelTo(centerRoomPos, { range: 15 });
        }
    }
}
