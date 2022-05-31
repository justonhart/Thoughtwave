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
    return Pathing.travelTo(this, new RoomPosition(25, 25, roomName), { range: 20, avoidHostiles: true, maxRooms: 30, maxOps: 20000, ...opts });
};

Creep.prototype.moveOffExit = function () {
    if (this.onEdge()) {
        this.move(this.pos.getDirectionTo(25, 25));
    }
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

Object.defineProperty(Creep.prototype, 'operation', {
    get: function (this: Creep) {
        return Memory.empire.operations.find((op) => op.targetRoom === this.memory.destination && op.type === this.memory.operation);
    },
    enumerable: false,
    configurable: true,
});
