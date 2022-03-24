import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Miner extends WaveCreep {
    public run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.harvest(
                this.pos
                    .findInRange(FIND_SOURCES, 1)
                    .reduce((biggestSource, sourceToCompare) => (biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare))
            );
        } else {
            this.travelTo(assignedPos);
        }
    }
}
