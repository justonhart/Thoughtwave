import { posFromMem } from './memoryManagement';

export class WaveCreep extends Creep {
    private static priorityQueue: Map<string, (creep: Creep) => void> = new Map();

    public run() {
        this.say(`Running ${this.name}`);
    }

    private claimSourceAccessPoint() {
        if (this.room.memory.availableSourceAccessPoints.length) {
            let accessPoints = this.room.memory.availableSourceAccessPoints.map((s) => posFromMem(s));
            let activeSources = this.room.find(FIND_SOURCES_ACTIVE);
            let activeAccessPoints = new Set<RoomPosition>();
            accessPoints.forEach((pos) => {
                activeSources.forEach((sourcePos) => {
                    if (pos.isNearTo(sourcePos)) {
                        activeAccessPoints.add(pos);
                    }
                });
            });

            let closest = this.pos.findClosestByPath(Array.from(activeAccessPoints), { ignoreCreeps: true });
            if (closest) {
                this.memory.miningPos = closest.toMemSafe();
                let index = accessPoints.findIndex((pos) => pos.isEqualTo(closest));
                this.room.memory.availableSourceAccessPoints.splice(index, 1).shift();
                return OK;
            }
        }

        return ERR_NOT_FOUND;
    }

    private releaseSourceAccessPoint() {
        this.room.memory.availableSourceAccessPoints.push(this.memory.miningPos);
        delete this.memory.miningPos;
    }

    //this assumes the creeps will have WORK parts - different creep subtypes may be necessary
    protected gatherEnergy() {
        if (this.store[RESOURCE_ENERGY] === this.store.getCapacity()) {
            this.releaseSourceAccessPoint();
            this.memory.gathering = false;
            return;
        }

        if (!this.memory.miningPos) {
            this.claimSourceAccessPoint();
        }

        let miningPos = posFromMem(this.memory.miningPos);
        if (miningPos) {
            if (this.pos.isEqualTo(miningPos)) {
                this.memory.currentTaskPriority = Priority.MEDIUM; // Priority for gathering Energy
                //find the source in mining range w/ the highest energy and harvest from it - this matters for mining positions adjacent to more than one source
                let highestSourceInRange = this.pos.findInRange(FIND_SOURCES, 1).reduce((a, b) => (a.energy > b.energy ? a : b));
                let miningResult = this.harvest(highestSourceInRange);

                if ((miningResult === OK && this.isEnergyHarvestingFinished()) || miningResult === ERR_NOT_ENOUGH_RESOURCES) {
                    this.memory.gathering = false;
                    this.releaseSourceAccessPoint();
                }
            } else {
                this.travelTo(miningPos);
            }
        }
    }

    protected runBuildJob(target: ConstructionSite) {
        let jobCost = BUILD_POWER * this.getActiveBodyparts(WORK);
        let buildSuccess = this.build(target);
        switch (buildSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3, avoidRoadOnLastMove: true, visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_INVALID_TARGET:
                delete this.memory.targetId;
                break;
            case OK:
                this.memory.currentTaskPriority = Priority.MEDIUM;
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
                this.travelTo(Game.rooms[this.memory.room].controller, {
                    range: 3,
                    avoidRoadOnLastMove: true,
                    visualizePathStyle: { stroke: '#ffffff' },
                });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
                delete this.memory.targetId;
                break;
            case OK:
                this.memory.currentTaskPriority = Priority.MEDIUM;
                if (this.usedAllRemainingEnergy(jobCost)) {
                    this.memory.gathering = true;
                    delete this.memory.targetId;
                }
                break;
        }
    }

    protected runStoreJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage) {
        switch (this.transfer(target, RESOURCE_ENERGY)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_FULL:
                this.memory.currentTaskPriority = Priority.MEDIUM;
                delete this.memory.targetId;
                break;
            case OK:
                if (target.store.getFreeCapacity(RESOURCE_ENERGY) >= this.store[RESOURCE_ENERGY]) {
                    this.memory.gathering = true;
                }
                delete this.memory.targetId;
                break;
        }
    }

    protected runRepairJob(target: Structure) {
        let jobCost = REPAIR_COST * REPAIR_POWER * this.getActiveBodyparts(WORK);
        let repairSuccess = this.repair(target);
        switch (repairSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3, avoidRoadOnLastMove: true, visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_INVALID_TARGET:
                delete this.memory.targetId;
                break;
            case OK:
                this.memory.currentTaskPriority = Priority.MEDIUM;
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

    /**
     * Add a task to the priority queue as long as the priority is equalTo or higher than the current task.
     * @param  creep                        -
     * @param  priority                     priority of the actionCallback
     * @param  actionCallback               function to be executed (build, harvest, travelTo, etc.)
     * @return                -
     */
    public static addToPriorityQueue(creep: Creep, priority: Priority, actionCallback: (creep: Creep) => void) {
        const currentTaskPriority = creep.memory.currentTaskPriority;
        if (currentTaskPriority && priority >= currentTaskPriority) {
            creep.memory.currentTaskPriority = priority; // Set new priority
            WaveCreep.priorityQueue.set(creep.name, actionCallback);
        }
    }

    public static runPriorityQueueTask(creep: Creep) {
        WaveCreep.priorityQueue.get(creep.name)(creep);
        WaveCreep.priorityQueue.delete(creep.name);
    }

    public static getCreepsWithPriorityTask(): string[] {
        return Array.from(WaveCreep.priorityQueue.keys());
    }

    private isRepairFinished(target: Structure): boolean {
        let workValue = this.getActiveBodyparts(WORK) * REPAIR_POWER;
        return target.hits >= target.hitsMax - workValue;
    }

    private isBuildFinished(target: ConstructionSite): boolean {
        let workValue = this.getActiveBodyparts(WORK) * BUILD_POWER;
        return target.progress >= target.progressTotal - workValue;
    }

    private isEnergyHarvestingFinished(): boolean {
        let harvestedAmount = this.getActiveBodyparts(WORK) * 2;
        return harvestedAmount >= this.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    private usedAllRemainingEnergy(energyUsedPerWork: number) {
        return this.store[RESOURCE_ENERGY] <= energyUsedPerWork;
    }
}
