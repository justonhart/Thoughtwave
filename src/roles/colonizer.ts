import { posFromMem } from '../modules/memoryManagement';
import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class Colonizer extends EarlyCreep {
    protected performDuties() {
        // Go to the target room
        if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
            let target = Game.getObjectById(this.memory.targetId);

            if (!this.memory.targetId || !target) {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }
            if (target instanceof ConstructionSite) {
                this.runBuildJob(target);
            } else {
                let spawnCreated = this.room.find(FIND_MY_STRUCTURES).filter((struct) => struct.structureType === STRUCTURE_SPAWN).length > 0;
                if (spawnCreated) {
                    let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
                    if (Memory.empire.colonizationOperations[opIndex]) {
                        Memory.empire.colonizationOperations[opIndex].stage = ColonizeStage.COMPLETE;
                        console.log(`${this.room.name} spawn has been build!`);
                    }
                    this.convertToWorker();
                } else {
                    this.prepareRoom();
                }
            }
        }
    }

    private findTarget(): Id<ConstructionSite> {
        let sites = this.room.find(FIND_MY_CONSTRUCTION_SITES).filter((site) => site.structureType === STRUCTURE_SPAWN);

        return sites.pop()?.id;
    }

    private prepareRoom() {
        let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);

        let preexistingStructures = this.room
            .find(FIND_STRUCTURES)
            //@ts-ignore
            .filter((structure) => ![STRUCTURE_WALL, STRUCTURE_STORAGE, STRUCTURE_TERMINAL].includes(structure.structureType));

        preexistingStructures.forEach((struct) => struct.destroy());

        let spawnPos = posFromMem(Memory.empire.colonizationOperations[opIndex].spawnPosition);
        this.room.createConstructionSite(spawnPos.x, spawnPos.y, STRUCTURE_SPAWN);
    }

    private convertToWorker() {
        this.memory.role = Role.WORKER; // Turn into worker
        this.memory.room = this.memory.destination; // Change to new room
    }
}
