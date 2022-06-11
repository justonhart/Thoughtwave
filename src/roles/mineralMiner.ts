import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class MineralMiner extends WaveCreep {
    protected run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            this.harvest(this.room.mineral);
        } else {
            this.travelTo(assignedPos, { maxOps: 20000, avoidHostileRooms: true });
        }
    }
}
