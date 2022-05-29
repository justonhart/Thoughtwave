import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Miner extends WaveCreep {
    public run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            this.harvest(
                this.pos
                    .findInRange(FIND_SOURCES, 1)
                    .reduce((biggestSource, sourceToCompare) => (biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare))
            );

            if (this.store.getCapacity() && this.store.getFreeCapacity() === 0) {
                let link: StructureLink = Game.getObjectById(this.memory.link);
                if (!link?.cooldown && link?.store.getFreeCapacity(RESOURCE_ENERGY) <= this.store.getCapacity()) {
                    link.transferEnergy(this.room.managerLink);
                }
                this.transfer(link, RESOURCE_ENERGY);
            }
        } else {
            this.travelTo(assignedPos, { maxOps: 20000, avoidHostiles: true });
        }
    }
}
