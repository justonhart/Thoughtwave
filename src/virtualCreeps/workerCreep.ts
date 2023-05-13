import { WaveCreep } from './waveCreep';

export class WorkerCreep extends WaveCreep {
    protected run() {
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

        let target = Game.getObjectById(this.memory.energySource);
        if (!target) {
            this.memory.energySource = this.findEnergySource();
            target = Game.getObjectById(this.memory.energySource);
        }

        if (target instanceof StructureStorage || target instanceof StructureTerminal) {
            switch (this.withdraw(target, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { range: 1, maxRooms: 1 });
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    delete this.memory.energySource;
                    break;
                case 0:
                    this.stopGathering();
                    break;
            }

            return;
        }

        if (target instanceof StructureContainer) {
            switch (this.withdraw(target, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { range: 1, maxRooms: 1 });
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    delete this.memory.energySource;
                    break;
                case 0:
                    this.stopGathering();
                    break;
            }

            return;
        }

        if (target instanceof Ruin || target instanceof Tombstone) {
            switch (this.withdraw(target, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { ignoreCreeps: true, range: 1, maxRooms: 1 });
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    delete this.memory.energySource;
                    break;
                case 0:
                    this.stopGathering();
                    break;
            }

            return;
        }

        if (target instanceof Resource) {
            switch (this.pickup(target)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { ignoreCreeps: true, range: 1, maxRooms: 1 });
                    break;
                case 0:
                    this.stopGathering();
                    break;
            }

            return;
        }
    }

    protected findEnergySource(): Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> {
        if (this.room.storage?.store[RESOURCE_ENERGY]) {
            return this.room.storage.id;
        } else if (!this.room.storage && this.room.terminal?.store.energy) {
            return this.room.terminal.id;
        }

        let nonStorageSources: (Ruin | Resource | Structure | Tombstone)[];

        let ruins = this.room.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });

        let tombstones = this.room.find(FIND_TOMBSTONES, { filter: (t) => t.store[RESOURCE_ENERGY] });

        let looseEnergyStacks = this.room
            .find(FIND_DROPPED_RESOURCES)
            .filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount >= this.store.getCapacity());

        let containers = this.room
            .find(FIND_STRUCTURES)
            .filter(
                (str) =>
                    str.structureType === STRUCTURE_CONTAINER &&
                    str.store.energy >= this.store.getCapacity() &&
                    !this.room.memory.stampLayout.container.some(
                        (containerStamp) =>
                            str.pos.toMemSafe() === containerStamp.pos && (containerStamp.type === 'center' || containerStamp.type === 'rm')
                    )
            );

        nonStorageSources = [...tombstones, ...ruins, ...looseEnergyStacks, ...containers];
        if (nonStorageSources.length) {
            return this.pos.findClosestByRange(nonStorageSources).id;
        }
    }

    protected runBuildJob(target: ConstructionSite) {
        this.memory.currentTaskPriority = Priority.LOW;
        let jobCost = BUILD_POWER * this.getActiveBodyparts(WORK);
        let buildSuccess = this.build(target);
        switch (buildSuccess) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 3, maxRooms: 1, exitCost: 10, avoidEdges: true });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case ERR_INVALID_TARGET:
                this.onTaskFinished();
                break;
            case OK:
                if (this.onEdge()) {
                    this.travelTo(target);
                }
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
        this.memory.currentTaskPriority = Priority.LOW;
        let jobCost = UPGRADE_CONTROLLER_POWER * this.getActiveBodyparts(WORK);
        switch (this.upgradeController(this.homeroom.controller)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.homeroom.controller, {
                    range: 3,
                    maxRooms: 1,
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
        this.memory.currentTaskPriority = Priority.LOW;
        if (target.hits < target.hitsMax) {
            let jobCost = REPAIR_COST * REPAIR_POWER * this.getActiveBodyparts(WORK);
            let repairSuccess = this.repair(target);
            switch (repairSuccess) {
                case ERR_NOT_IN_RANGE:
                    const opts: TravelToOpts = { range: 3, maxRooms: 1, avoidEdges: true };
                    if (
                        this.homeroom.memory.threatLevel === HomeRoomThreatLevel.ENEMY_INVADERS ||
                        this.homeroom.memory.threatLevel >= HomeRoomThreatLevel.ENEMY_ATTTACK_CREEPS
                    ) {
                        opts.avoidEdges = true;
                    } else {
                        opts.exitCost = 10;
                    }
                    this.travelTo(target, opts);
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    this.memory.gathering = true;
                case ERR_INVALID_TARGET:
                    this.onTaskFinished();
                    break;
                case OK:
                    if (this.onEdge()) {
                        this.travelTo(target);
                    }
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

    // dismantle until done, ignoring resources
    protected runHardDismantleJob(target: Structure) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        if (target.pos.isNearTo(this)) {
            this.dismantle(target);
        } else {
            this.travelTo(target);
        }
    }

    // dismantle until full of energy
    protected runDismantleJob(target: Structure) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        if (this.store.getFreeCapacity()) {
            if (target.pos.isNearTo(this)) {
                this.dismantle(target);
            } else {
                this.travelTo(target);
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

    protected findConstructionSite(): Id<ConstructionSite> {
        let constructionSites = this.homeroom.find(FIND_MY_CONSTRUCTION_SITES);
        if (constructionSites.length) {
            //@ts-expect-error
            let containsPrioritySites = constructionSites.some((site) => ![STRUCTURE_ROAD, STRUCTURE_RAMPART].includes(site.structureType));

            if (containsPrioritySites) {
                //@ts-expect-error
                constructionSites = constructionSites.filter((site) => ![STRUCTURE_ROAD, STRUCTURE_RAMPART].includes(site.structureType));
            }

            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((mostProgressedSite, siteToCheck) =>
                mostProgressedSite.progress / mostProgressedSite.progressTotal > siteToCheck.progress / siteToCheck.progressTotal
                    ? mostProgressedSite
                    : siteToCheck
            ).id;
        }
    }

    protected stopGathering() {
        this.memory.gathering = false;
        delete this.memory.energySource;
    }
}
