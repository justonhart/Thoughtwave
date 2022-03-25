import { Pathing } from '../modules/pathing';
import { WaveCreep } from '../virtualCreeps/waveCreep';

Creep.prototype.travelTo = function (destination, opts) {
    return Pathing.travelTo(this, destination, opts);
};

Creep.prototype.travelToRoom = function (roomName, opts) {
    if (this.room.name === roomName && !this.onEdge()) {
        return IN_ROOM;
    }
    return this.travelTo(new RoomPosition(25, 25, roomName), { ...opts, range: 23, reusePath: 50, maxOps: 10000 });
};

Creep.prototype.onEdge = function () {
    const { x, y } = Pathing.normalizePos(this.pos);
    return x <= 0 || y <= 0 || x >= 49 || y >= 49;
};

Creep.prototype.addTaskToPriorityQueue = function (priority: Priority, actionCallback: () => void) {
    WaveCreep.addToPriorityQueue(this, priority, actionCallback);
};

Creep.prototype.runPriorityQueueTask = function () {
    WaveCreep.runPriorityQueueTask(this);
};
