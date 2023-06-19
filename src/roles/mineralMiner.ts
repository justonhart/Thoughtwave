import { WaveCreep } from '../virtualCreeps/waveCreep';

export class MineralMiner extends WaveCreep {
    memory: MineralMinerMemory;
    protected run() {
        let assignedPos = this.memory.assignment.toRoomPos();
        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            let container = this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (container?.store.getFreeCapacity() >= this.getActiveBodyparts(WORK)) {
                const mineral = this.pos.findInRange(FIND_MINERALS, 1).pop();
                if(mineral){
                    const result = this.harvest(mineral);
                    if (result === ERR_NOT_ENOUGH_RESOURCES) {
                        // Finished mining
                        this.memory.recycle = true;
                    }
                }
           }
        } else {
            this.travelTo(assignedPos, { maxOps: 20000, avoidHostileRooms: true });
        }
    }
}
