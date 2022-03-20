import { Pathing } from '../modules/pathing';

Creep.prototype.travelTo = function (destination, opts) {
    return Pathing.travelTo(this, destination, opts);
};
