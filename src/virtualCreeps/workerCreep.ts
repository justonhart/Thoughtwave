import { roomNeedsCoreStructures } from '../modules/roomDesign';
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
        this.memory.currentTaskPriority = Priority.LOW;

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
                default:
                    this.stopGathering();
                    break;
            }

            return;
        }
    }

    protected findEnergySource(): Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> {
        this.debugLog('looking for energy source');
        if (this.room.storage?.store[RESOURCE_ENERGY]) {
            return this.room.storage.id;
        } else if (!this.room.storage && this.room.terminal?.store.energy) {
            return this.room.terminal.id;
        }

        let ruins = this.room.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });

        let tombstones = this.room.find(FIND_TOMBSTONES, { filter: (t) => t.store[RESOURCE_ENERGY] });

        let miscSources = [...ruins, ...tombstones];
        if (miscSources.length) {
            return this.pos.findClosestByRange(miscSources)?.id;
        }

        if (!roomNeedsCoreStructures(this.homeroom)) {
            const upgradeContainer = this.homeroom.memory.stampLayout.container
                .find((stamp) => stamp.type === STRUCTURE_CONTROLLER)
                ?.pos.toRoomPos()
                .look()
                .find(
                    (lookObj) =>
                        lookObj.energy ||
                        (lookObj.structure?.structureType === STRUCTURE_CONTAINER && (lookObj.structure as StructureContainer).store.energy)
                );
            if (upgradeContainer) {
                return upgradeContainer.energy ? upgradeContainer.energy.id : upgradeContainer.structure.id;
            }
        }

        let centerContainerStamps = this.room.memory.stampLayout.container.filter((stamp) => stamp.type === 'center');
        let centerContainers = centerContainerStamps
            .map((stamp) =>
                stamp.pos
                    .toRoomPos()
                    .lookFor(LOOK_STRUCTURES)
                    .find((s: StructureContainer) => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 750)
            )
            .filter((s) => !!s);
        if (centerContainers.length) {
            return this.pos.findClosestByRange(centerContainers)?.id;
        }

        let centerResources = centerContainerStamps.map((stamp) => stamp.pos.toRoomPos().lookFor(LOOK_ENERGY).pop()).filter((r) => !!r);
        if (centerResources.length) {
            return this.pos.findClosestByRange(centerResources)?.id;
        }
    }

    protected runBuildJob(target: ConstructionSite) {
        this.debugLog('running build job');
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
        this.debugLog('running upgrade job');
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
        this.debugLog('running repair job');
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
        let constructionSites = this.homeroom.myConstructionSites;
        if (constructionSites.length) {
            //@ts-expect-error
            let containsPrioritySites = constructionSites.some((site) => ![STRUCTURE_ROAD, STRUCTURE_RAMPART].includes(site.structureType));

            if (containsPrioritySites) {
                //@ts-expect-error
                constructionSites = constructionSites.filter((site) => ![STRUCTURE_ROAD, STRUCTURE_RAMPART].includes(site.structureType));
            }

            const mostProgressedRatio = constructionSites.reduce(
                (mostProgressedRatio: number, nextSite: ConstructionSite) =>
                    mostProgressedRatio > nextSite.progress / nextSite.progressTotal
                        ? mostProgressedRatio
                        : nextSite.progress / nextSite.progressTotal,
                0
            );
            const mostProgressedSites = constructionSites.filter((site) => site.progress / site.progressTotal >= mostProgressedRatio);
            return this.pos.findClosestByRange(mostProgressedSites).id;
        }
    }

    protected stopGathering() {
        this.memory.gathering = false;
        delete this.memory.energySource;
    }
}
