import { WaveCreep } from './waveCreep';

export class WorkerCreep extends WaveCreep {
    public run() {
        if (this.memory.gathering === true) {
            this.gatherEnergy();
        } else {
            this.performDuties();
        }
    }

    protected performDuties() {
        this.say('WorkerCreep');
    }

    protected gatherEnergy() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let ruins = this.room.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });
        if (ruins.length) {
            let target = this.pos.findClosestByPath(ruins, { ignoreCreeps: true, range: 1 });
            switch (this.withdraw(target, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { ignoreCreeps: true, range: 1 });
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }

            return;
        }

        if (this.homeroom.storage?.my === true && this.homeroom.storage.store[RESOURCE_ENERGY]) {
            switch (this.withdraw(this.homeroom.storage, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.homeroom.storage);
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }

            return;
        }

        if (this.homeroom.terminal && this.homeroom.terminal.store[RESOURCE_ENERGY]) {
            switch (this.withdraw(this.homeroom.terminal, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.homeroom.terminal, { ignoreCreeps: true, range: 1 });
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }

            return;
        }
    }

    protected runBuildJob(target: ConstructionSite) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let jobCost = BUILD_POWER * this.getActiveBodyparts(WORK);
        let buildSuccess = this.build(target);
        switch (buildSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3, avoidRoadOnLastMove: true, visualizePathStyle: { stroke: '#ffffff' } });
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

    protected runUpgradeJob() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let jobCost = UPGRADE_CONTROLLER_POWER * this.getActiveBodyparts(WORK);
        switch (this.upgradeController(this.homeroom.controller)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.homeroom.controller, {
                    range: 3,
                    avoidRoadOnLastMove: true,
                    visualizePathStyle: { stroke: '#ffffff' },
                });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
                this.onTaskFinished();
                break;
            case OK:
                if (this.usedAllRemainingEnergy(jobCost)) {
                    this.memory.gathering = true;
                    this.onTaskFinished();
                }
                break;
            case ERR_INVALID_TARGET:
                this.onTaskFinished();
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
                    this.travelTo(target, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
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

    protected getDefenseHitpointTarget() {
        return this.room.controller.level * 50000;
    }
}
