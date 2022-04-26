import { Pathing } from '../modules/pathing';
import { WaveCreep } from '../virtualCreeps/waveCreep';

Creep.prototype.travelTo = function (destination, opts) {
    return Pathing.travelTo(this, destination, opts);
};

// TODO: optimize where maxOps is default since it uses findRoute once for the rooms in route, then calculates path for each room on enter
Creep.prototype.travelToRoom = function (roomName, opts) {
    if (this.room.name === roomName && !this.onEdge()) {
        return IN_ROOM;
    }
    return this.travelTo(new RoomPosition(25, 25, roomName), { ...opts, range: 23, avoidHostiles: true, maxOps: 20000 });
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

Object.defineProperty(Creep.prototype, 'homeroom', {
    get: function (this: Creep) {
        return Game.rooms[this.memory.room];
    },
    enumerable: false,
    configurable: true,
});
