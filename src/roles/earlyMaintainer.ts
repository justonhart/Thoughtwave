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
        } else if (target instanceof StructureStorage) {
            this.runFillStorage();
        } else if (target instanceof Structure) {
            this.runRepairJob(target);
        } else if (target instanceof ConstructionSite) {
            this.runBuildJob(target);
        } else {
            this.onTaskFinished();
        }
    }

    protected findTarget(): Id<Structure> | Id<ConstructionSite> {
        let constructedDefenses = this.pos
            .findInRange(FIND_STRUCTURES, 3)
            .filter(
                (structure) => (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) && structure.hits === 1
            );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        let damagedStructures = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                ![STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < structure.hitsMax
        );
        if (damagedStructures.length) {
            //find the lowest health ratio
            let lowestRatio = Math.min(...damagedStructures.map((structure) => structure.hits / structure.hitsMax));

            //take only those with the lowest ratio and find the closest target among them
            let mostDamagedStructures = damagedStructures.filter((structure) => structure.hits / structure.hitsMax === lowestRatio);
            return this.pos.findClosestByPath(mostDamagedStructures, { range: 3, ignoreCreeps: true }).id;
        }

        let constructionSite = this.findConstructionSite();
        if (constructionSite) {
            return constructionSite;
        }

        let defenses = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                //@ts-ignore
                [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < this.getDefenseHitpointTarget()
        );
        if (defenses.length) {
            let closest = this.pos.findClosestByPath(defenses, { range: 3, ignoreCreeps: true });
            if (!closest) {
                return defenses.shift().id;
            }
            return closest.id;
        }

        if (this.homeroom.storage?.my) {
            return this.homeroom.storage.id;
        }

        return this.homeroom.controller?.id;
    }
}
