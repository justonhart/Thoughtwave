import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Transporter extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (this.store.getFreeCapacity() > this.store.getCapacity() / 2) {
            target = this.findCollectionTarget();
        }

        //store resources before running refills
        if (!target && this.store.energy < this.store.getUsedCapacity()) {
            target = this.room.storage.id;
        }

        if (!target) {
            target = this.findRefillTarget();
        }

        if (!target) {
            target = this.room.storage.id;
        }

        return target;
    }
}
