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
            if (!target.store[RESOURCE_ENERGY]) {
                this.stopGathering();
                return;
            }
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

        if (this.memory.role === Role.UPGRADER) {
            const upgradeContainer = this.homeroom.memory.stampLayout.container
                .find((stamp) => stamp.type === STRUCTURE_CONTROLLER)
                ?.pos.toRoomPos()
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER && (s as StructureContainer).store[RESOURCE_ENERGY]);
            if (upgradeContainer) {
                return upgradeContainer.id;
            }
        }

        if (this.homeroom.storage?.store[RESOURCE_ENERGY]) {
            return this.homeroom.storage.id;
        } else if (!this.homeroom.storage && this.homeroom.terminal?.store.energy) {
            return this.homeroom.terminal.id;
        }

        let ruins = this.homeroom.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });

        let tombstones = this.homeroom.find(FIND_TOMBSTONES, { filter: (t) => t.store[RESOURCE_ENERGY] });

        let miscSources = [...ruins, ...tombstones];
        if (miscSources.length) {
            return this.pos.findClosestByRange(miscSources)?.id;
        }

        //if no storage, check various centralized energy structures (center containers, upgrade containers)
        let containerPositionsToCheck: string[] = [];

        const upgradeContainer = this.homeroom.memory.stampLayout.container.find((stamp) => stamp.type === STRUCTURE_CONTROLLER)?.pos;
        if (upgradeContainer) {
            containerPositionsToCheck.push(upgradeContainer);
        }

        let centerContainerStamps = this.homeroom.memory.stampLayout.container.filter((stamp) => stamp.type === 'center');
        let centerContainers = centerContainerStamps.map((stamp) => stamp.pos);

        containerPositionsToCheck.push(...centerContainers);
        let checkPositionEnergy = (pos: string): { pos: string; energy: number } => {
            return {
                pos: pos,
                energy: pos
                    .toRoomPos()
                    .look()
                    .reduce(
                        (energySum, nextLook) =>
                            nextLook.structure?.structureType === STRUCTURE_CONTAINER
                                ? energySum + (nextLook.structure as StructureContainer).store.energy
                                : nextLook.resource?.resourceType === RESOURCE_ENERGY
                                ? energySum + nextLook.resource.amount
                                : energySum,
                        0
                    ),
            };
        };

        //if there is a distributor, it gets priority access to miner sources
        if (!this.homeroom.myCreeps.some((c) => c.memory.role === Role.DISTRIBUTOR)) {
            containerPositionsToCheck.push(...Object.keys(this.homeroom.memory.miningAssignments));
        }

        const positionsToConsider = containerPositionsToCheck.map((pos) => checkPositionEnergy(pos)).filter((pos) => pos.energy);
        if (positionsToConsider.length) {
            const positionToGatherFrom = this.pos.findClosestByRange(positionsToConsider.map((pos) => pos.pos.toRoomPos()));
            const posLook = positionToGatherFrom.look();
            const posEnergyResource = posLook.find((look) => look.resource?.resourceType === RESOURCE_ENERGY)?.resource.id;
            if (posEnergyResource) {
                return posEnergyResource;
            }

            const posContainer = posLook.find(
                (look) =>
                    look.structure?.structureType === STRUCTURE_CONTAINER &&
                    (look.structure as StructureContainer).store[RESOURCE_ENERGY] >=
                        (this.homeroom.memory.stampLayout.container.some((s) => s.pos === look.structure.pos.toMemSafe() && s.type === 'center')
                            ? 750
                            : 0)
            )?.structure.id;
            if (posContainer) {
                return posContainer;
            }
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
