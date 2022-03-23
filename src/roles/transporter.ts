import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Transporter extends TransportCreep {
    protected findTarget() {
        let target = this.findCollectionTarget();

        //store resources before running refills
        if (!target && this.store.getUsedCapacity() === this.store[RESOURCE_ENERGY]) {
            target = this.room.storage.id;
        }

        if (!target) {
            target = this.findRefillTarget();
        }

        return target;
    }
}
