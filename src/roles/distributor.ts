import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Distributor extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (!target && this.homeroom.memory.labRequests?.length) {
            if (this.store.getUsedCapacity() && this.homeroom.storage) {
                target = this.homeroom.storage.id;
            } else {
                this.claimLabRequests();
                return;
            }
        }

        // Always check for refill targets as long as there is energy in storage or on creep
        if (
            !target &&
            (this.homeroom.storage?.store.energy > 0 ||
                this.store.energy + this.incomingEnergyAmount + this.incomingMineralAmount > this.outgoingResourceAmount)
        ) {
            // If creep has non energy in store then put it back in storage first
            if (this.homeroom.storage && this.store.energy < this.store.getUsedCapacity() + this.incomingMineralAmount) {
                target = this.homeroom.storage.id;
            } else {
                try {
                    target = this.findRefillTarget();
                } catch (e) {
                    console.log(`Error caught running findRefillTarget in ${this.name}: \n${e}`);
                }
            }
        }

        // If Creep has 90% of his storage capacity available
        if (
            !target &&
            this.store.getFreeCapacity() + this.outgoingResourceAmount - this.incomingEnergyAmount - this.incomingMineralAmount >=
                this.store.getCapacity() * 0.9
        ) {
            try {
                target = this.findCollectionTarget();
            } catch (e) {
                console.log(`Error caught running findCollectionTarget in ${this.name}: \n${e}`);
            }
        }

        // Nothing to do so drop everything off at storage
        if (!target && this.room.storage?.store.getFreeCapacity()) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }
}
