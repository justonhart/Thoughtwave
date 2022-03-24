import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Miner extends WaveCreep {
    public run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.harvest(this.pos.findInRange(FIND_SOURCES, 1).reduce((a, b) => (a.energy > b.energy ? a : b)));
        } else {
            this.travelTo(assignedPos);
        }
    }
}
