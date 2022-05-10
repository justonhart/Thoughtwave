import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    public run() {
        let assignedPos = posFromMem(this.memory.assignment);

        if (Memory.rooms[this.memory.room].remoteAssignments[assignedPos.roomName].state === RemoteMiningRoomState.ENEMY) {
            this.travelToRoom(this.memory.room, { range: 20 }); // Travel back to home room
            if (this.memory._m) {
                this.memory._m.repath = 1; // do not create roads
            }
            return;
        }

        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            const site = this.pos.look().filter((object) => object.type === LOOK_STRUCTURES || object.type === LOOK_CONSTRUCTION_SITES);
            if (!site.length) {
                // possible optimization: add "hasPerformedAction" array for each creep so that after the first check it will only have to look into memory
                this.pos.createConstructionSite(STRUCTURE_CONTAINER);
            } else if (this.getActiveBodyparts(CARRY)) {
                if (site[0].type === LOOK_CONSTRUCTION_SITES) {
                    this.build(site[0].constructionSite);
                } else if (site[0].type === LOOK_STRUCTURES && site[0].structure.hits < site[0].structure.hitsMax) {
                    this.repair(site[0].structure);
                }
            }
            this.harvest(
                this.pos
                    .findInRange(FIND_SOURCES, 1)
                    .reduce((biggestSource, sourceToCompare) => (biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare))
            );
        } else {
            this.travelTo(assignedPos, { preferRoadConstruction: true });
            // Create roads to the source if not already present and the remote miner did not have to repath
            if (
                !this.memory._m?.repath &&
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