import { TransportCreep } from '../virtualCreeps/transportCreep';

// TODO: right now I just copied some of the worker functions over. Find a better way to reuse already existing methods
export class Gatherer extends TransportCreep {
    public run() {
        if (Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].state === RemoteMiningRoomState.ENEMY) {
            this.travelToRoom(this.memory.room); // Travel back to home room
            return;
        }

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
        } else if (target instanceof Tombstone) {
            this.runCollectionJob(target);
        } else if (target instanceof StructureContainer) {
            // Repair vs Collect
            let jobCost = REPAIR_COST * REPAIR_POWER * this.getActiveBodyparts(WORK);
            if (this.usedAllRemainingEnergy(jobCost)) {
                this.runCollectionJob(target);
            } else {
                this.runRepairJob(target);
            }
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
            this.repairRoad();
        } else if (target instanceof ConstructionSite) {
            this.runBuildJob(target);
        }
    }

    protected findTarget() {
        let target: any;

        // Gather
        if (!target && this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            target = this.findCollectionTarget(this.memory.assignment);
        }

        // Build
        if (!target) {
            const constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
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
            const damagedContainer = this.room.find(FIND_STRUCTURES, {
                filter: (struct) => struct.structureType === STRUCTURE_CONTAINER && struct.hits < struct.hitsMax / 1.25,
            });
            if (damagedContainer.length) {
                return damagedContainer[0].id;
            }
        }

        // Hauler
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
            case ERR_INVALID_TARGET:
                this.onTaskFinished();
                break;
            case OK:
                if (this.isBuildFinished(target) || this.usedAllRemainingEnergy(jobCost)) {
                    this.onTaskFinished();
                }
                break;
        }
    }

    /**
     * Repair road on current creep position if necessary
     */
    protected repairRoad() {
        const damagedRoad = this.pos
            .lookFor(LOOK_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_ROAD && structure.hits < structure.hitsMax);
        if (damagedRoad.length) {
            this.repair(damagedRoad[0]);
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
                case ERR_INVALID_TARGET:
                    this.onTaskFinished();
                    break;
                case OK:
                    if (this.isRepairFinished(target)) {
                        this.onTaskFinished();
                    }
                    if (this.usedAllRemainingEnergy(jobCost)) {
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
