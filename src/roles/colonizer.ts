import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class Colonizer extends EarlyCreep {
    protected performDuties() {
        const flag = Game.flags.colonizer;

        if (flag) {
            // Go to the target room
            if (this.travelToRoom(flag.pos.roomName) === IN_ROOM) {
                let target = Game.getObjectById(this.memory.targetId);

                if (!this.memory.targetId || !target) {
                    this.memory.targetId = this.findTarget();
                    target = Game.getObjectById(this.memory.targetId);
                }
                if (target instanceof ConstructionSite) {
                    // Create Spawn in target room
                    this.runBuildJob(target);
                } else {
                    // finished building spawn
                    Game.flags.colonizer.remove();
                    console.log(`${this.room.name} spawn has been build!`);
                    this.memory.role = Role.WORKER; // Turn into worker
                    this.memory.room = this.room.name; // Change to new room
                }
            }
        }
    }

    private findTarget(): Id<ConstructionSite> {
        return this.room
            .find(FIND_MY_CONSTRUCTION_SITES) //
            .filter((constructionSite) => constructionSite.structureType === STRUCTURE_SPAWN) //
            .map((spawnConstructionSite) => spawnConstructionSite.id)[0];
    }
}
