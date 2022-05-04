import { TransportCreep } from '../virtualCreeps/transportCreep';

export class RemoteDistributor extends TransportCreep {
    // TODO: add repair on currentPos if needed
    // TODO: look in memory assignment for targetRoom
    protected findTarget() {
        let target: any;

        if (this.store.energy < this.store.getUsedCapacity()) {
            target = this.homeroom.storage?.id;
        }

        if (!target && (this.homeroom.storage?.store.energy > 0 || this.store.energy > 0)) {
            target = this.findRefillTarget();
        }

        if (!target && this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            target = this.findCollectionTarget(this.memory.assignment);
        }

        if (!target) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }
}
