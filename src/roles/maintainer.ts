import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Maintainer extends WorkerCreep {
    protected performDuties() {
        let target = Game.getObjectById(this.memory.targetId);

        if (!this.memory.targetId || !target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (target instanceof StructureController) {
            this.runUpgradeJob();
        } else if (target instanceof Structure) {
            this.runRepairJob(target);
        } else if (target instanceof ConstructionSite) {
            this.runBuildJob(target);
        } else {
            delete this.memory.targetId;
        }
    }

    private findTarget(): Id<Structure> | Id<ConstructionSite> {
        let rammpartsAtRisk = this.room
            .find(FIND_MY_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_RAMPART && structure.hits <= 10000);
        if (rammpartsAtRisk.length) {
            return this.pos.findClosestByPath(rammpartsAtRisk, { ignoreCreeps: true }).id;
        }

        let repairTarget = this.room.getRepairTarget();
        if (repairTarget) {
            return repairTarget;
        }

        let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((mostProgressedSite, siteToCheck) =>
                mostProgressedSite.progress / mostProgressedSite.progressTotal > siteToCheck.progress / siteToCheck.progressTotal
                    ? mostProgressedSite
                    : siteToCheck
            ).id;
        }

        let defenses = this.room.find(FIND_STRUCTURES).filter(
            (structure) =>
                //@ts-ignore
                [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < this.getDefenseHitpointTarget()
        );
        if (defenses.length) {
            return defenses.reduce((weakest, defToCompare) => (weakest.hits < defToCompare.hits ? weakest : defToCompare)).id;
        }

        return this.room.controller?.id;
    }

    private getDefenseHitpointTarget() {
        return this.room.controller.level * 50000;
    }
}
