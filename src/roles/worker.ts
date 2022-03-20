import { WaveCreep } from '../modules/WaveCreep';

export class Worker extends WaveCreep {
    public run() {
        if (this.memory.gathering) {
            this.gatherEnergy();
        } else {
            if (!this.memory.targetId) {
                this.memory.targetId = this.findTarget();
            }

            let target = Game.getObjectById(this.memory.targetId);

            if (
                target instanceof StructureExtension ||
                target instanceof StructureTower ||
                target instanceof StructureSpawn ||
                target instanceof StructureStorage
            ) {
                this.runStoreJob(target);
            } else if (target instanceof ConstructionSite) {
                this.runBuildJob(target);
            } else if (target instanceof StructureController) {
                this.runUpgradeJob();
            }
        }
    }

    private findTarget(): Id<Structure> | Id<ConstructionSite> {
        let spawnStructures = this.room
            .find(FIND_MY_STRUCTURES)
            .filter(
                (s) =>
                    (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) &&
                    s.store[RESOURCE_ENERGY] < s.store.getCapacity(RESOURCE_ENERGY)
            );

        if (spawnStructures.length) {
            return this.pos.findClosestByPath(spawnStructures).id;
        }

        let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);

        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.sort((a, b) => b.progress / b.progressTotal - a.progress / a.progressTotal).shift().id;
        } else {
            return this.room.controller?.id;
        }
    }
}
