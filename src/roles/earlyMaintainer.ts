import { EarlyCreep } from '../virtualCreeps/earlyCreep';

export class EarlyMaintainer extends EarlyCreep {
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
        let rammpartsAtRisk = this.room.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_RAMPART && s.hits <= 1000);
        if (rammpartsAtRisk.length) {
            return this.pos.findClosestByPath(rammpartsAtRisk, { ignoreCreeps: true }).id;
        }

        let damagedStructures = this.room.find(FIND_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                ![STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < structure.hitsMax
        );
        if (damagedStructures.length) {
            //find the lowest health ratio
            let lowestRatio = Math.min(...damagedStructures.map((s) => s.hits / s.hitsMax));

            //take only those with the lowest ratio and find the closest target among them
            let mostDamagedStructures = damagedStructures.filter((s) => s.hits / s.hitsMax === lowestRatio);
            return this.pos.findClosestByPath(mostDamagedStructures, { range: 3, ignoreCreeps: true }).id;
        }

        let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);

        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((a, b) => (a.progress / a.progressTotal > b.progress / b.progressTotal ? a : b)).id;
        }

        let defenses = this.room.find(FIND_STRUCTURES).filter(
            (s) =>
                //@ts-ignore
                [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(s.structureType) && s.hits < this.getDefenseHitpointTarget()
        );
        if (defenses.length) {
            return this.pos.findClosestByPath(defenses, { range: 3, ignoreCreeps: true }).id;
        }

        return this.room.controller?.id;
    }

    private getDefenseHitpointTarget() {
        return this.room.controller.level * 10000;
    }
}
