import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class Colonizer extends EarlyCreep {
    // TODO could be optimized to change from colonizer to normal worker after job is done
    protected performDuties() {
        const flag = Game.flags.colonizer;

        if (flag) {
            // Go to the target room
            if (flag.pos.roomName !== this.pos.roomName) {
                this.travelTo(flag, { reusePath: 50, maxOps: 10000 });
            } else {
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
                    console.log(`§{this.room.name} spawn has been build! Time to die.`);
                    this.suicide();
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
