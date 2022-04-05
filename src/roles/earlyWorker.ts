import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class EarlyWorker extends EarlyCreep {
    protected performDuties() {
        let target = Game.getObjectById(this.memory.targetId);

        if (!this.memory.targetId || !target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (target instanceof StructureExtension || target instanceof StructureTower || target instanceof StructureSpawn) {
            this.runRefillJob(target);
        } else if (target instanceof StructureStorage) {
            this.runFillStorage();
        } else if (target instanceof ConstructionSite) {
            this.runBuildJob(target);
        } else if (target instanceof StructureController) {
            this.runUpgradeJob();
        } else if (target instanceof Structure) {
            this.runRepairJob(target);
        } else {
            delete this.memory.targetId;
        }
    }

    private findTarget(): Id<Structure> | Id<ConstructionSite> {
        let constructedDefenses = this.pos
            .findInRange(FIND_STRUCTURES, 3)
            .filter(
                (structure) => (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) && structure.hits === 1
            );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        let spawnStructures = this.homeroom.find(FIND_MY_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(structure.structureType) &&
                // @ts-ignore
                structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
        );

        if (spawnStructures.length) {
            return this.pos.findClosestByPath(spawnStructures, { ignoreCreeps: true }).id;
        }

        let towers = this.homeroom.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_TOWER && s.store[RESOURCE_ENERGY] < 700);
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }

        let constructionSites = this.homeroom.find(FIND_MY_CONSTRUCTION_SITES);

        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((mostProgressedSite, siteToCheck) =>
                mostProgressedSite.progress / mostProgressedSite.progressTotal > siteToCheck.progress / siteToCheck.progressTotal
                    ? mostProgressedSite
                    : siteToCheck
            ).id;
        }

        if (this.homeroom.storage?.my) {
            return this.homeroom.storage.id;
        }

        return this.homeroom.controller?.id;
    }
}
