import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class EarlyUpgrader extends EarlyCreep {
    protected performDuties() {
        this.runUpgradeJob();
    }
}
