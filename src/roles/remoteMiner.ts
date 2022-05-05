import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class RemoteMiner extends WaveCreep {
    public run() {
        let assignedPos = posFromMem(this.memory.assignment);
        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            if (!this.pos.lookFor(LOOK_STRUCTURES).length && !this.pos.lookFor(LOOK_CONSTRUCTION_SITES).length) {
                // TODO optimize only check when new miner arrives (should happen on every new miner in case it got destroyed)
                this.pos.createConstructionSite(STRUCTURE_CONTAINER);
            }
            this.harvest(
                this.pos
                    .findInRange(FIND_SOURCES, 1)
                    .reduce((biggestSource, sourceToCompare) => (biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare))
            );
        } else {
            this.travelTo(assignedPos, { preferRoadConstruction: true, stayOnPath: true });
            // Create roads to the source if not already present
            if (
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
