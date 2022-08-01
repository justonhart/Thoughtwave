import { posFromMem } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class MineralMiner extends WaveCreep {
    protected run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            let container = this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (container?.store.getFreeCapacity() >= this.getActiveBodyparts(WORK)) {
                this.harvest(this.room.mineral);
            }
        } else {
            this.travelTo(assignedPos, { maxOps: 20000, avoidHostileRooms: true });
        }
    }
}
