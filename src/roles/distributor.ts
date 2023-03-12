import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Distributor extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (!target && this.homeroom.memory.labRequests?.length) {
            if (this.store.getUsedCapacity()) {
                target = this.homeroom.storage.id;
            } else {
                this.claimLabRequests();
                return;
            }
        }

        if (!target && (this.homeroom.storage?.store.energy > 0 || this.store.energy + this.incomingResourceAmount > this.outgoingResourceAmount)) {
            if (this.homeroom.storage && this.store.energy < this.store.getUsedCapacity()) {
                target = this.homeroom.storage.id;
            } else {
                target = this.findRefillTarget();
            }
        }

        if (!target && this.store.getFreeCapacity() + this.incomingResourceAmount >= this.store.getCapacity() * 0.9) {
            target = this.findCollectionTarget();
        }

        if (!target && this.room.storage?.store.getFreeCapacity()) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }
}
