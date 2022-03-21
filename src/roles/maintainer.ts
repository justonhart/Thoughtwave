import { WaveCreep } from '../modules/WaveCreep';

export class Maintainer extends WaveCreep {
    public run() {
        if (this.memory.gathering) {
            this.gatherEnergy();
        } else {
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
    }

    private findTarget(): Id<Structure> | Id<ConstructionSite> {
        let damagedStructures = this.room.find(FIND_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                ![STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < structure.hitsMax
        );
        if (damagedStructures.length) {
            //sort ascending by health ratio
            damagedStructures.sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax);

            //take only the lowest ratio and find the closest target among them
            let mostDamagedStructures = damagedStructures.filter(
                (s) => s.hits / s.hitsMax === damagedStructures[0].hits / damagedStructures[0].hitsMax
            );
            return this.pos.findClosestByPath(mostDamagedStructures, {range: 3, ignoreCreeps: true}).id;
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
