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

        let decayingStructuresAtRisk = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                //@ts-expect-error
                structure.ticksToDecay !== undefined &&
                (structure.structureType === STRUCTURE_RAMPART
                    ? structure.hits <= this.getDefenseHitpointTarget() * 0.1
                    : structure.hits <= structure.hitsMax * 0.1)
        );
        if (decayingStructuresAtRisk.length) {
            return this.pos.findClosestByPath(decayingStructuresAtRisk)?.id;
        }

        let repairQueue = this.homeroom.memory.repairQueue;
        if (repairQueue.length) {
            let closest = this.pos.findClosestByPath(repairQueue.map((id) => Game.getObjectById(id)))?.id;
            this.homeroom.removeFromRepairQueue(closest);
            return closest;
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
            return defenses.reduce((weakest, defToCompare) => (weakest.hits < defToCompare.hits ? weakest : defToCompare))?.id;
        }

        return this.homeroom.controller?.id;
    }
}
