import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Distributor extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (this.store.energy < this.store.getUsedCapacity() && this.room.storage?.store.getFreeCapacity()) {
            target = this.homeroom.storage?.id;
        }

        if (!target && (this.homeroom.storage?.store.energy > 0 || this.store.energy > 0)) {
            target = this.findRefillTarget();
        }

        if (!target && this.homeroom.memory.labRequests?.length) {
            this.memory.labRequest = this.homeroom.memory.labRequests.shift();
            target = this.memory.labRequest.lab;
        }

        if (!target && this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            target = this.findCollectionTarget();
        }

        if (!target && this.room.storage?.store.getFreeCapacity()) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }
}
