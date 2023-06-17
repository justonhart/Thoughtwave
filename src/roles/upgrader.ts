import { roomNeedsCoreStructures } from '../modules/roomDesign';
import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Upgrader extends WorkerCreep {
    memory: WorkerCreepMemory;
    protected run() {
        //focus all energy into building room in early rooms
        if (!this.homeroom.storage && roomNeedsCoreStructures(this.homeroom)) {
            this.memory.recycle = true;
        }

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
