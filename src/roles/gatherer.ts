import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    public run() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            if (this.pos.roomName !== this.memory.assignment) {
                return this.travelToRoom(this.memory.assignment); // travel to room before finding a target
            } else {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }
        }

        if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer) {
            this.runCollectionJob(target);
        } else if (target instanceof StructureSpawn || target instanceof StructureExtension || target instanceof StructureTower) {
            if (this.store.energy) {
                this.runRefillJob(target);
            } else {
                this.gatherEnergy();
            }
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
        } else if (target instanceof Structure) {
            // WORKER CREEP
            this.runRepairJob(target);
        } else if (target instanceof ConstructionSite) {
            this.runBuildJob(target);
        }
    }

    protected findTarget() {
        let target: any;

        if (!target && this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            target = this.findCollectionTarget(this.memory.assignment);
        }

        if (!target) {
            // look for build jobs in assigned room
            let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
            if (constructionSites.length) {
                const container = constructionSites.find((site) => site.structureType === STRUCTURE_CONTAINER);
                if (container) {
                    target = container.id;
                } else {
                    return constructionSites.reduce((mostProgressedSite, siteToCheck) =>
                        mostProgressedSite.progress / mostProgressedSite.progressTotal > siteToCheck.progress / siteToCheck.progressTotal
                            ? mostProgressedSite
                            : siteToCheck
                    ).id;
                }
            }
        }

        if (!target) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }

    protected runBuildJob(target: ConstructionSite) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let jobCost = BUILD_POWER * this.getActiveBodyparts(WORK);
        let buildSuccess = this.build(target);
        switch (buildSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3 });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_INVALID_TARGET:
                this.onTaskFinished();
                break;
            case OK:
                if (this.isBuildFinished(target)) {
                    this.onTaskFinished();
                }
                if (this.usedAllRemainingEnergy(jobCost)) {
                    this.memory.gathering = true;
                    this.onTaskFinished();
                }
                break;
        }
    }

    protected runRepairJob(target: Structure) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        if (target.hits < target.hitsMax) {
            let jobCost = REPAIR_COST * REPAIR_POWER * this.getActiveBodyparts(WORK);
            let repairSuccess = this.repair(target);
            switch (repairSuccess) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { range: 3 });
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    this.memory.gathering = true;
                case ERR_INVALID_TARGET:
                    this.onTaskFinished();
                    break;
                case OK:
                    if (this.isRepairFinished(target)) {
                        this.onTaskFinished();
                    }
                    if (this.usedAllRemainingEnergy(jobCost)) {
                        this.memory.gathering = true;
                        this.onTaskFinished();
                    }
                    break;
            }
        } else {
            this.onTaskFinished();
        }
    }

    protected isRepairFinished(target: Structure): boolean {
        let workValue = this.getActiveBodyparts(WORK) * REPAIR_POWER;
        return target.hits >= target.hitsMax - workValue;
    }

    protected isBuildFinished(target: ConstructionSite): boolean {
        let workValue = this.getActiveBodyparts(WORK) * BUILD_POWER;
        return target.progress >= target.progressTotal - workValue;
    }

    protected usedAllRemainingEnergy(energyUsedPerWork: number) {
        return this.store[RESOURCE_ENERGY] <= energyUsedPerWork;
    }
}
