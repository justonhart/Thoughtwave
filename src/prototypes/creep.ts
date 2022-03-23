import { Pathing } from '../modules/pathing';
import { WaveCreep } from '../virtualCreeps/WaveCreep';

Creep.prototype.travelTo = function (destination, opts) {
    return Pathing.travelTo(this, destination, opts);
};

Creep.prototype.addTaskToPriorityQueue = function (priority: Priority, actionCallback: () => void) {
    WaveCreep.addToPriorityQueue(this, priority, actionCallback);
};

Creep.prototype.runPriorityQueueTask = function () {
    WaveCreep.runPriorityQueueTask(this);
};
