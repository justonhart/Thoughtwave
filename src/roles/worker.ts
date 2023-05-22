import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Worker extends WorkerCreep {
    memory: WorkerCreepMemory;
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
        if (this.homeroom.controller.level >= 6) {
            let nukeShieldTarget = this.homeroom.getNextNukeProtectionTask();
            if (nukeShieldTarget) {
                return nukeShieldTarget;
            }
        }

        let constructedDefenses = this.homeroom.structures.filter(
            (struct) =>
                (struct.structureType === STRUCTURE_RAMPART || struct.structureType === STRUCTURE_WALL) &&
                struct.hits === 1 &&
                this.pos.getRangeTo(struct) <= 3
        );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        if (
            !this.homeroom.controller.upgradeBlocked &&
            this.homeroom.controller.ticksToDowngrade <= this.homeroom.controller.ticksToDowngradeMax * 0.75
        ) {
            return this.homeroom.controller.id;
        }

        let spawnSite = this.homeroom.myConstructionSites.find((site) => site.structureType === STRUCTURE_SPAWN);
        if (spawnSite && !this.homeroom.canSpawn()) {
            return spawnSite.id;
        }

        let decayingStructuresAtRisk = this.homeroom.structures.filter(
            (structure) =>
                //@ts-expect-error
                structure.ticksToDecay !== undefined &&
                (structure.structureType === STRUCTURE_RAMPART
                    ? structure.hits <= Math.min(this.homeroom.getDefenseHitpointTarget() * 0.1, 500000)
                    : structure.hits <= structure.hitsMax * 0.1)
        );
        if (decayingStructuresAtRisk.length) {
            return this.pos.findClosestByRange(decayingStructuresAtRisk)?.id; //findClosestByPath was hanging up on unreachable manager rampart...
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

        if (this.homeroom.memory.needsWallRepair) {
            let defensesToRepair = this.homeroom.structures.filter(
                (s) => (s.structureType === STRUCTURE_RAMPART || s.structureType === STRUCTURE_WALL) && s.hits < s.hitsMax
            );
            if (defensesToRepair.length) {
                return defensesToRepair.reduce((weakest, defToCompare) => (weakest.hits < defToCompare.hits ? weakest : defToCompare))?.id;
            }
        }

        return this.homeroom.controller?.id;
    }
}
