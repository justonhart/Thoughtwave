import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Sentry extends WaveCreep {
    protected run() {
        const targetRoom = Game.rooms[this.memory.assignment];
        if (!targetRoom) {
            this.travelTo(new RoomPosition(25, 25, targetRoom.name), { range: 15 });
        } else {
            const hostileCreeps = this.room.hostileCreeps.filter(
                (creep) => creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK)
            );
            if (hostileCreeps) {
                return this.travelTo(hostileCreeps[0], {
                    goals: hostileCreeps.map((creep) => ({ pos: creep.pos, range: 7 })),
                    reusePath: 0,
                    range: 7,
                    flee: true,
                    exitCost: 10,
                    maxRooms: 1,
                });
            } else {
                // Wait inside the room away from all exits
                this.travelTo(new RoomPosition(25, 25, targetRoom.name), { range: 15 });
            }
        }
    }
}
