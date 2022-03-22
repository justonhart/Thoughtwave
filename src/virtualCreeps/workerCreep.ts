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

        if (this.room.storage?.my === true && this.room.storage.store[RESOURCE_ENERGY]) {
            switch (this.withdraw(this.room.storage, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.room.storage);
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }

            return;
        }

        if (this.room.terminal && this.room.terminal.store[RESOURCE_ENERGY]) {
            switch (this.withdraw(this.room.terminal, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.room.terminal, { ignoreCreeps: true, range: 1 });
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }

            return;
        }
    }

    protected runBuildJob(target: ConstructionSite) {
        let jobCost = BUILD_POWER * this.getActiveBodyparts(WORK);
        let buildSuccess = this.build(target);
        switch (buildSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_INVALID_TARGET:
                delete this.memory.targetId;
                break;
            case OK:
                if (this.isBuildFinished(target)) {
                    delete this.memory.targetId;
                }
                if (this.usedAllRemainingEnergy(jobCost)) {
                    this.memory.gathering = true;
                    delete this.memory.targetId;
                }
                break;
        }
    }

    protected runUpgradeJob() {
        let jobCost = UPGRADE_CONTROLLER_POWER * this.getActiveBodyparts(WORK);
        switch (this.upgradeController(Game.rooms[this.memory.room].controller)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(Game.rooms[this.memory.room].controller, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
                delete this.memory.targetId;
                break;
            case OK:
                if (this.usedAllRemainingEnergy(jobCost)) {
                    this.memory.gathering = true;
                    delete this.memory.targetId;
                }
                break;
        }
    }

    protected runRepairJob(target: Structure) {
        let jobCost = REPAIR_COST * REPAIR_POWER * this.getActiveBodyparts(WORK);
        let repairSuccess = this.repair(target);
        switch (repairSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3, visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_INVALID_TARGET:
                delete this.memory.targetId;
                break;
            case OK:
                if (this.isRepairFinished(target)) {
                    delete this.memory.targetId;
                }
                if (this.usedAllRemainingEnergy(jobCost)) {
                    this.memory.gathering = true;
                    delete this.memory.targetId;
                }
                break;
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
