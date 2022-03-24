import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Distributor extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (this.store.energy < this.store.getUsedCapacity()) {
            target = this.room.storage.id;
        }

        if (!target) {
            target = this.findRefillTarget();
        }

        if (!target && this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            target = this.findCollectionTarget();
        }

        if (!target) {
            target = this.room.storage.id;
        }

        return target;
    }
}
