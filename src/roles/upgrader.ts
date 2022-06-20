import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Upgrader extends WorkerCreep {
    protected run() {
        if (!this.store.energy) {
            if (!this.room.upgraderLink) {
                this.gatherEnergy();
            } else {
                if (!this.pos.isNearTo(this.room.upgraderLink)) {
                    this.travelTo(this.room.upgraderLink, { range: 1 });
                } else {
                    this.withdraw(this.room.upgraderLink, RESOURCE_ENERGY);
                }
            }
        } else {
            this.runUpgradeJob();
        }
    }
}
