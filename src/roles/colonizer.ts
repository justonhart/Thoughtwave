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
                // Create Spawn in target room
                this.runBuildJob(target);
            } else if (target instanceof StructureSpawn) {
                console.log(`${this.room.name} spawn has been build!`);

                let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
                if (Memory.empire.colonizationOperations[opIndex]) {
                    Memory.empire.colonizationOperations[opIndex].stage = ColonizeStage.COMPLETE;
                }
                this.memory.role = Role.WORKER; // Turn into worker
                this.memory.room = this.room.name; // Change to new room
            } else {
                let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
                let spawnPos = posFromMem(Memory.empire.colonizationOperations[opIndex].spawnPosition);
                this.room.createConstructionSite(spawnPos.x, spawnPos.y, STRUCTURE_SPAWN);
            }
        }
    }

    private findTarget(): Id<ConstructionSite> | Id<Structure> {
        let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
        let spawnPos = posFromMem(Memory.empire.colonizationOperations[opIndex].spawnPosition);

        let lookResults = spawnPos.look();
        if (lookResults.filter((object) => object.type === LOOK_CONSTRUCTION_SITES).length) {
            return lookResults.filter((object) => object.type === LOOK_CONSTRUCTION_SITES).shift().constructionSite.id;
        } else if (lookResults.filter((object) => object.type === LOOK_STRUCTURES).length) {
            return lookResults.filter((object) => object.type === LOOK_STRUCTURES).shift().structure.id;
        }

        return undefined;
    }
}
