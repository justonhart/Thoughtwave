import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Upgrader extends WorkerCreep {
    protected performDuties() {
        this.runUpgradeJob();
    }
}
