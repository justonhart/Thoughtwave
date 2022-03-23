import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Distributor extends TransportCreep {
    protected findTarget() {
        let target: any;

        target = this.findRefillTarget();

        if (!target) {
            target = this.findCollectionTarget();
        }

        //if target needs refill, store non-energy resources first
        return this.store.energy === this.store.getUsedCapacity() ? target : null;
    }
}
