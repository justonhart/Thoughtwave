import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class EarlyDrone extends EarlyCreep {
    protected performDuties() {
        let target = Game.getObjectById(this.memory.targetId);

        if (!this.memory.targetId || !target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (
            target instanceof StructureExtension ||
            target instanceof StructureTower ||
            target instanceof StructureSpawn ||
            target instanceof StructureStorage
        ) {
            this.runRefillJob(target);
        } else if (target instanceof ConstructionSite) {
            this.runBuildJob(target);
        } else if (target instanceof StructureController) {
            this.runUpgradeJob();
        } else {
            delete this.memory.targetId;
        }
    }

    private findTarget(): Id<Structure> | Id<ConstructionSite> {
        let spawnStructures = this.room.find(FIND_MY_STRUCTURES).filter(
            (s) =>
                // @ts-ignore
                [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(s.structureType) && s.store[RESOURCE_ENERGY] < s.store.getCapacity(RESOURCE_ENERGY)
        );

        if (spawnStructures.length) {
            return this.pos.findClosestByPath(spawnStructures, { ignoreCreeps: true }).id;
        }

        let towers = this.room.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < 700);
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }

        let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);

        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((a, b) => (a.progress / a.progressTotal > b.progress / b.progressTotal ? a : b)).id;
        }

        return this.room.controller?.id;
    }
}
