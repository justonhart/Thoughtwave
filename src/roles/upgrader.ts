import { WaveCreep } from '../modules/WaveCreep';

export class Upgrader extends WaveCreep {
    public run() {
        if (this.memory.gathering) {
            this.gatherEnergy();
        } else {
            this.runUpgradeJob();
        }
    }
}
