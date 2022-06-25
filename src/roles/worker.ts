import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Worker extends WorkerCreep {
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
        let nukeShieldTarget = this.homeroom.getNextNukeProtectionTask();
        if (nukeShieldTarget) {
            return nukeShieldTarget;
        }

        let constructedDefenses = this.pos
            .findInRange(FIND_STRUCTURES, 3)
            .filter(
                (structure) => (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) && structure.hits === 1
            );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        if (
            !this.homeroom.controller.upgradeBlocked &&
            this.homeroom.controller.ticksToDowngrade <= this.homeroom.controller.ticksToDowngradeMax / 2
        ) {
            return this.homeroom.controller.id;
        }

        let spawnSite = this.homeroom.find(FIND_CONSTRUCTION_SITES).find((site) => site.structureType === STRUCTURE_SPAWN);
        if (spawnSite && !this.homeroom.canSpawn()) {
            return spawnSite.id;
        }

        let decayingStructuresAtRisk = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                //@ts-expect-error
                structure.ticksToDecay !== undefined &&
                (structure.structureType === STRUCTURE_RAMPART
                    ? structure.hits <= this.room.getDefenseHitpointTarget() * 0.1
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

        if (this.room.memory.needsWallRepair || this.room.controller.level === 8) {
            let defensesToRepair = this.homeroom.find(FIND_STRUCTURES, {
                filter: (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < s.hitsMax,
            });
            if (defensesToRepair.length) {
                return defensesToRepair.reduce((weakest, defToCompare) => (weakest.hits < defToCompare.hits ? weakest : defToCompare))?.id;
            }
        }

        return this.homeroom.controller?.id;
    }
}
