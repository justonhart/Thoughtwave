import { posFromMem } from '../modules/memoryManagement';
import { posInsideBunker } from '../modules/roomDesign';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    protected run() {
        let assignedPos = posFromMem(this.memory.assignment);

        if (Memory.rooms[this.memory.room].remoteAssignments[assignedPos.roomName]?.state === RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            if (this.memory._m) {
                this.memory._m.repath = 1; // do not create roads
            }
            return;
        }

        if (this.pos.isEqualTo(assignedPos)) {
            this.memory.currentTaskPriority = Priority.HIGH;
            const site = this.pos
                .look()
                .filter(
                    (object) =>
                        object.structure?.structureType === STRUCTURE_CONTAINER || object.constructionSite?.structureType === STRUCTURE_CONTAINER
                );
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
            // avoid placing roads when there is an invader core in the room
            if (
                Object.values(this.homeroom.memory.remoteAssignments).some((assignment) => assignment.state === RemoteMiningRoomState.ENEMY_STRUCTS)
            ) {
                if (this.memory._m) {
                    this.memory._m.repath = 1; // do not create roads
                }
            }
            this.travelTo(assignedPos, { preferRoadConstruction: true });
            // Create roads to the source if not already present and the remote miner did not have to repath
            if (
                !this.memory._m?.repath &&
                (this.room !== this.homeroom || !posInsideBunker(this.pos)) &&
                this.memory._m.visibleRooms.includes(this.room.name) &&
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
