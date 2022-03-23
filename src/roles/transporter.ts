import { TransportCreep } from '../virtualCreeps/transporterCreep';

export class Transporter extends TransportCreep {
    protected findTarget() {
        let target = this.findCollectionTarget();

        //store resources before running refills
        if (!target && this.store.getUsedCapacity() === this.store[RESOURCE_ENERGY]) {
            target = this.findRefillTarget();
        }

        return target;
    }
}
