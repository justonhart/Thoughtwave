import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class RemoteMiner extends WaveCreep {
    public run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            if (!this.pos.look().filter((object) => object.type === LOOK_STRUCTURES || object.type === LOOK_CONSTRUCTION_SITES).length) {
                // possible optimization: add "hasPerformedAction" array for each creep so that after the first check it will only have to look into memory
                this.pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
            this.harvest(
                this.pos
                    .findInRange(FIND_SOURCES, 1)
                    .reduce((biggestSource, sourceToCompare) => (biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare))
            );
        } else {
            this.travelTo(assignedPos, { preferRoadConstruction: true, avoidHostiles: false });
            // Create roads to the source if not already present and the remote miner did not have to repath
            if (
                !this.memory._m.repath &&
                !this.pos
                    .look()
                    .filter(
                        (object) =>
                            (object.type === LOOK_STRUCTURES && object.structure.structureType !== STRUCTURE_RAMPART) ||
                            object.type === LOOK_CONSTRUCTION_SITES
                    ).length
            ) {
                this.pos.createConstructionSite(STRUCTURE_ROAD);
            }
        }
    }
}
