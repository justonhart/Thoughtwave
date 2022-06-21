import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Upgrader extends WorkerCreep {
    protected run() {
        if (!this.room.upgraderLink) {
            if (!this.store.energy) {
                this.gatherEnergy();
            } else {
                this.runUpgradeJob();
            }
        } else {
            if (this.store.energy <= this.getActiveBodyparts(WORK)) {
                if (!this.pos.isNearTo(this.room.upgraderLink)) {
                    this.travelTo(this.room.upgraderLink);
                } else {
                    this.withdraw(this.room.upgraderLink, RESOURCE_ENERGY);
                }
            }
            this.runUpgradeJob();
        }
    }
}
