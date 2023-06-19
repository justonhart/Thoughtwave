import { PopulationManagement } from '../modules/populationManagement';
import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    private previousTargetId: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> | Id<Mineral> | Id<Source>;
    protected incomingEnergyAmount: number = 0; // Picked up energy in same tick to do proper retargeting
    protected incomingMineralAmount: number = 0; // Picked up non-energy in same tick to do proper retargeting
    protected outgoingResourceAmount: number = 0; // Dropped off energy in the same tick to do proper retargeting
    protected actionTaken: boolean = false;
    protected labs: StructureLab[];
    memory: TransportCreepMemory;
    protected run() {

        if(this.room.name !== this.homeroom.name){
            this.travelToRoom(this.memory.room);
            return;
        }

        if (this.memory.gathering === true) {
            this.gatherEnergy();

            if (!this.memory.gathering) {
                this.runTransporterTasks();
            }
        } else {
            this.runTransporterTasks();

            if (this.memory.gathering) {
                this.gatherEnergy();
            }
        }
    }

    protected findNextTask() {
        this.debugLog('looking for task');
    }

    protected runTransporterTasks() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target && !this.memory.labNeeds?.length) {
            this.debugLog(`looking for target`);
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        let stop = false;

        if (this.memory.labNeeds?.length) {
            this.manageLabs();
        } else {
            stop = this.runNonLabPrepTasks();

            //round 2
            if (!stop && !this.memory.targetId) {
                if (this.memory.debug) {
                    this.debugLog('finding next target');
                }
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);

                if (this.memory.labNeeds?.length) {
                    this.manageLabs();
                } else {
                    this.runNonLabPrepTasks();
                }
            } else if (stop && this.homeroom.controller.level >= 3) {
                if (this.body.length >= PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], this.room.energyCapacityAvailable, 10).length) {
                    this.debugLog('renewing');
                    this.renewCreep();
                }
            }
        }
    }

    private runNonLabPrepTasks() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (target instanceof Resource) {
            this.runPickupJob(target);
            return false;
        } else if (
            target instanceof StructureContainer &&
            this.homeroom.memory.stampLayout.container.some(
                (containerStamp) => (containerStamp.type === 'center' || containerStamp.type === 'controller') && containerStamp.pos === target.pos.toMemSafe()
            ) &&
            Object.keys(target.store).length <= 1
        ) {
            this.runRefillJob(target);
            return false;
        } else if (
            target instanceof Tombstone ||
            target instanceof Ruin ||
            target instanceof StructureContainer ||
            target?.status === LabStatus.NEEDS_EMPTYING
        ) {
            this.runCollectionJob(target);
            return false;
        } else if (
            target instanceof StructureSpawn ||
            target instanceof StructureExtension ||
            target instanceof StructureTower ||
            target instanceof StructureLab
        ) {
            this.runRefillJob(target);
            return false;
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
            return false;
        } else if (target instanceof StructurePowerSpawn) {
            this.runRefillPowerSpawnJob(target);
            return false;
        }

        return true;
    }

    protected findTarget(): any {
        this.say('targeting');
    }

    //gather energy to distribute
    protected gatherEnergy(): void {
        this.memory.currentTaskPriority = Priority.HIGH;

        let target = Game.getObjectById(this.memory.energySource);
        if (!target) {
            this.memory.energySource = this.findEnergySource();
            target = Game.getObjectById(this.memory.energySource);
        }

        if (target instanceof Structure || target instanceof Ruin) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
            } else if (!this.actionTaken) {
                let result = this.withdraw(target, RESOURCE_ENERGY);
                switch (result) {
                    case 0:
                        // @ts-ignore
                        this.incomingEnergyAmount += Math.min(this.store.getFreeCapacity(), target.store.energy);
                        this.actionTaken = true;
                    case ERR_FULL:
                    default:
                        this.stopGathering();
                        break;
                }
            }

            return;
        }

        if (target instanceof Resource) {
            if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { ignoreCreeps: true, range: 1, currentTickEnergy: this.incomingEnergyAmount });
            } else if (!this.actionTaken) {
                switch (this.pickup(target)) {
                    case 0:
                        if (target.resourceType === RESOURCE_ENERGY) {
                            this.incomingEnergyAmount += Math.min(this.store.getFreeCapacity(), target.amount);
                        } else {
                            this.incomingMineralAmount += Math.min(this.store.getFreeCapacity(), target.amount);
                        }
                        this.actionTaken = true;
                    case ERR_FULL:
                    default:
                        this.stopGathering();
                        break;
                }
            }

            return;
        }

        //if no source is found, use held resources
        this.stopGathering();
    }

    protected findEnergySource(): Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> {
        if (this.room.storage?.store[RESOURCE_ENERGY] >= this.store.getCapacity()) {
            return this.room.storage.id;
        }

        let nonStorageSources: (Ruin | Resource | Structure)[];

        const ruins = this.room.find(FIND_RUINS, {
            filter: (r) => {
                return r.store[RESOURCE_ENERGY];
            },
        });

        const looseEnergyStacks = this.room.find(FIND_DROPPED_RESOURCES).filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount);
        let containers = this.room.structures.filter((str) => {
            let isAllowedStampContainer = true;
            // In Stamps do not allow retrieving energy from center/rm containers or miner containers with links
            const container = this.room.memory.stampLayout.container.find((containerStamp) => str.pos.toMemSafe() === containerStamp.pos);
            if (container && container.type?.includes('source')) {
                isAllowedStampContainer = !this.room.memory.stampLayout.link.some(
                    (linkStamp) =>
                        linkStamp.type === container.type &&
                        linkStamp.pos
                            .toRoomPos()
                            .lookFor(LOOK_STRUCTURES)
                            .some((lookStr) => lookStr.structureType === STRUCTURE_LINK)
                );
            } else {
                isAllowedStampContainer = false;
            }
            return str.structureType === STRUCTURE_CONTAINER && str.store.energy >= this.store.getCapacity() && isAllowedStampContainer;
        });

        nonStorageSources = [...(ruins ?? []), ...(looseEnergyStacks ?? []), ...containers];
        if (nonStorageSources.length) {
            return this.pos.findClosestByRange(nonStorageSources).id;
        }

        if (this.room.terminal?.store?.energy >= this.store.getCapacity()) {
            return this.room.terminal.id;
        }
    }

    protected stopGathering() {
        this.memory.gathering = false;
        delete this.memory.energySource;
    }

    protected storeCargo(targetStruct?: Structure) {
        let target = targetStruct ?? this.room.storage;
        this.memory.currentTaskPriority = Priority.HIGH;
        let resourceToStore: any = Object.keys(this.store).shift();
        if (!this.pos.isNearTo(target)) {
            this.travelTo(target, {
                ignoreCreeps: true,
                range: 1,
                currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount,
            });
        } else if (!this.actionTaken) {
            let storeResult = this.transfer(target, resourceToStore);
            switch (storeResult) {
                case ERR_NOT_IN_RANGE:
                    break;
                case 0:
                    this.actionTaken = true;
                    this.outgoingResourceAmount += this.store[resourceToStore].amount;
                    if (this.store[resourceToStore] === this.store.getUsedCapacity()) {
                        this.onTaskFinished();
                    }
                    break;
                case ERR_FULL:
                default:
                    this.onTaskFinished();
                    break;
            }
        }
    }

    protected findRefillTarget(): Id<Structure> {
        const ROOM_STRUCTURES = this.homeroom.structures.filter(
            (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
        );
        const towers = ROOM_STRUCTURES.filter(
            (structure) => structure.structureType === STRUCTURE_TOWER && this.previousTargetId !== structure.id && structure.store.energy < 900
        ) as StructureTower[];
        if (towers.some((tower) => tower.store.energy < 300)) {
            const towerToRefill = this.pos.findClosestByPath(
                towers.filter((tower) => tower.store.energy < 300),
                { ignoreCreeps: true }
            );

            this.debugLog(`found tower to refill: ${towerToRefill.pos.toMemSafe()}`);
        }

        let labs = ROOM_STRUCTURES.filter(
            (structure) =>
                structure.structureType === STRUCTURE_LAB &&
                this.previousTargetId !== structure.id &&
                structure.store.energy < structure.store.getCapacity(RESOURCE_ENERGY)
        );
        if (labs.length) {
            const labToRefill = this.pos.findClosestByPath(labs, { ignoreCreeps: true });
            this.debugLog(`found lab to refill: ${labToRefill.pos.toMemSafe()}`);
            return labToRefill.id;
        }

        const managerLinksBuilt =
            this.room.controller.level >= 5 &&
            this.room.memory.stampLayout.link.reduce(
                (result, nextStamp) =>
                    (nextStamp.rcl === 5
                        ? nextStamp.pos
                              .toRoomPos()
                              .lookFor(LOOK_STRUCTURES)
                              .some((s) => s.structureType === STRUCTURE_LINK)
                        : true) && result,
                true
            );

        // if manager links aren't built, the distributor needs to continue filling up containers even if spawn energy is at full capacity
        if (this.homeroom.energyAvailable < this.homeroom.energyCapacityAvailable || !managerLinksBuilt) {
            const structuresToRefill: Structure[] = [];
            const misplacedSpawns = this.room.spawns.filter(
                (spawn) =>
                    spawn.store.getFreeCapacity(RESOURCE_ENERGY) &&
                    !this.room.memory.stampLayout.spawn.some((stamp) => stamp.pos === spawn.pos.toMemSafe())
            );
            structuresToRefill.push(...misplacedSpawns);

            const centerLinkPos = this.room.memory.stampLayout.link.find((stamp) => stamp.type === 'center').pos.toRoomPos();
            const centerExtensions = this.room.memory.stampLayout.extension
                .filter((stamp) => stamp.rcl <= this.room.controller.level && stamp.type === 'center')
                .map((stamp) =>
                    stamp.pos
                        .toRoomPos()
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_EXTENSION)
                )
                .filter((s: StructureExtension) => s?.store.getFreeCapacity(RESOURCE_ENERGY) && this.previousTargetId !== s.id);
            const containersToRefill: StructureContainer[] = [];

            const leftCenterContainer = this.room.memory.stampLayout.container
                .find((stamp) => stamp.rcl === 2)
                .pos.toRoomPos()
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            const missingManager = this.room.memory.stampLayout.managers.some(
                (stamp) =>
                    stamp.rcl <= this.room.controller.level &&
                    stamp.type === 'center' &&
                    !stamp.pos
                        .toRoomPos()
                        .lookFor(LOOK_CREEPS)
                        .some((creep) => creep.memory.destination === stamp.pos)
            );
            if (!leftCenterContainer || missingManager) {
                const leftCenterExtensions = centerExtensions.filter((extension) => extension.pos.x < centerLinkPos.x);
                structuresToRefill.push(...leftCenterExtensions);
                const leftSpawn = this.room.memory.stampLayout.spawn
                    .find((stamp) => stamp.rcl === 1)
                    .pos.toRoomPos()
                    .lookFor(LOOK_STRUCTURES)
                    .find((s) => s.structureType === STRUCTURE_SPAWN) as StructureSpawn;
                if (leftSpawn?.store.getFreeCapacity(RESOURCE_ENERGY) && leftSpawn.id !== this.previousTargetId) {
                    structuresToRefill.push(leftSpawn);
                }
            } else if (leftCenterContainer.store.getFreeCapacity() && leftCenterContainer.id !== this.previousTargetId) {
                containersToRefill.push(leftCenterContainer);
            }

            const rightCenterContainer = this.room.memory.stampLayout.container
                .find((stamp) => stamp.rcl === 3 && stamp.type === 'center')
                .pos.toRoomPos()
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (!rightCenterContainer || missingManager) {
                const rightCenterExtensions = centerExtensions.filter((extension) => extension.pos.x > centerLinkPos.x);
                structuresToRefill.push(...rightCenterExtensions);
                const rightSpawn = this.room.memory.stampLayout.spawn
                    .find((stamp) => stamp.rcl === 7)
                    .pos.toRoomPos()
                    .lookFor(LOOK_STRUCTURES)
                    .find((s) => s.structureType === STRUCTURE_SPAWN) as StructureSpawn;
                if (rightSpawn?.store.getFreeCapacity(RESOURCE_ENERGY) && rightSpawn.id !== this.previousTargetId) {
                    structuresToRefill.push(rightSpawn);
                }
            } else if (rightCenterContainer.store.getFreeCapacity() && rightCenterContainer.id !== this.previousTargetId) {
                containersToRefill.push(rightCenterContainer);
            }

            if ((!rightCenterContainer && !leftCenterContainer) || missingManager) {
                const centerCenterExtensions = centerExtensions.filter((extension) => extension.pos.x === centerLinkPos.x);
                structuresToRefill.push(...centerCenterExtensions);
                const centerSpawn = this.room.memory.stampLayout.spawn
                    .find((stamp) => stamp.rcl === 8)
                    .pos.toRoomPos()
                    .lookFor(LOOK_STRUCTURES)
                    .find((s) => s.structureType === STRUCTURE_SPAWN) as StructureSpawn;
                if (centerSpawn?.store.getFreeCapacity(RESOURCE_ENERGY) && centerSpawn.id !== this.previousTargetId) {
                    structuresToRefill.push(centerSpawn);
                }
            }

            const missingMiner = Object.values(this.room.memory.miningAssignments).some((miner) => miner === AssignmentStatus.UNASSIGNED);
            const nonCenterExtensions = this.room.memory.stampLayout.extension
                .filter(
                    (stamp) =>
                        stamp.rcl <= this.room.controller.level &&
                        (!stamp.type || (stamp.type !== 'center' && (stamp.type.startsWith('source') ? missingMiner : false)))
                )
                .map((stamp) =>
                    stamp.pos
                        .toRoomPos()
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_EXTENSION)
                )
                .filter((s: StructureExtension) => s?.store.getFreeCapacity(RESOURCE_ENERGY) && s.id !== this.previousTargetId);
            structuresToRefill.push(...nonCenterExtensions);

            const controllerContainer = this.homeroom.memory.stampLayout.container.find(stamp => stamp.type === 'controller')?.pos.toRoomPos().lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if(!containersToRefill.some(c => c.store.getUsedCapacity(RESOURCE_ENERGY) < 1000) && controllerContainer?.store.getFreeCapacity(RESOURCE_ENERGY)){
                containersToRefill.push(controllerContainer);
            }

            if (structuresToRefill.length) {
                const structureToRefill = this.pos.findClosestByRange(structuresToRefill);
                this.debugLog(`found structure to refill: ${structureToRefill.structureType} (${structureToRefill.pos.toMemSafe()})`);
                return structureToRefill.id;
            } else if (containersToRefill.length) {
                const containerToRefill = containersToRefill.reduce((lowest, nextContainer) =>
                    nextContainer.store.energy < lowest.store.energy ? nextContainer : lowest
                );
                this.debugLog(`found center container to refill: ${containerToRefill.pos.toMemSafe()}`);
                return containerToRefill.id;
            }
        }

        // Now fill them completely
        if (towers.length) {
            const towerToRefill = this.pos.findClosestByPath(towers, { ignoreCreeps: true });
            this.debugLog(`found tower to refill: ${towerToRefill.pos.toMemSafe()}`);
            return towerToRefill.id;
        }

        if (this.homeroom.controller.level === 8) {
            const powerSpawnInNeed = ROOM_STRUCTURES.filter(
                (structure) =>
                    structure.structureType === STRUCTURE_POWER_SPAWN &&
                    (!structure.store.getUsedCapacity(RESOURCE_ENERGY) ||
                        (!structure.store.getUsedCapacity(RESOURCE_POWER) &&
                            ROOM_STRUCTURES.some(
                                (structure) =>
                                    (structure.structureType === STRUCTURE_STORAGE || structure.structureType === STRUCTURE_TERMINAL) &&
                                    structure.store.power
                            )))
            ) as StructurePowerSpawn[];
            if (powerSpawnInNeed.length) {
                this.debugLog(`refilling powerspawn`);
                return powerSpawnInNeed[0].id;
            }
        }
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> | Id<Tombstone> | Id<Ruin> {
        if (Game.time < this.memory.sleepCollectTil) {
            return;
        }

        let room = this.homeroom;
        if (roomName) {
            room = Game.rooms[roomName];
        }
        if (!room) {
            return undefined;
        }

        if (this.room.storage) {
            const labsNeedingEmptied = this.room.labs?.filter((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
            if (labsNeedingEmptied.length) {
                const lab = this.pos.findClosestByRange(labsNeedingEmptied);
                this.debugLog(`found lab to empty: ${lab.pos.toMemSafe()}`);
                return lab.id;
            }
        }

        const ruinsWithResources = room.find(FIND_RUINS, {
            filter: (ruin) => (this.room.storage ? ruin.store.getUsedCapacity() > 1000 : ruin.store[RESOURCE_ENERGY]),
        });
        if (ruinsWithResources.length) {
            const ruin = this.pos.findClosestByPath(ruinsWithResources, { ignoreCreeps: true, range: 1 });
            this.debugLog(`found ruin to empty: ${ruin.pos.toMemSafe()}`);
            return ruin.id;
        }

        if (this.room.storage) {
            const centerContainerWithNonEnergyResources = this.room.memory.stampLayout.container
                .filter((stamp) => stamp.type === 'center')
                .map((stamp) =>
                    stamp.pos
                        .toRoomPos()
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_CONTAINER)
                )
                .find((s: StructureContainer) => !!s && Object.keys(s.store).some((resource) => resource !== RESOURCE_ENERGY));

            if (centerContainerWithNonEnergyResources) {
                this.debugLog(`found center container to clean: ${centerContainerWithNonEnergyResources.pos.toMemSafe()}`);
                return centerContainerWithNonEnergyResources.id;
            }
        }

        // For Stamps it only allows containers at miners when they are too full (should be emptied through link) or there isnt a link yet
        const containers: StructureContainer[] = room.structures.filter(
            (structure) =>
                structure.structureType === STRUCTURE_CONTAINER &&
                structure.store.getUsedCapacity() &&
                // Get mineral containers and miner containers that not yet have a link (only checks for rcl but it will still gather energy from container until link is build if it is too full)
                room.memory.stampLayout.container.some(
                    (containerStamp) =>
                        containerStamp.pos === structure.pos.toMemSafe() &&
                        ((containerStamp.type === 'mineral' && this.room.storage) ||
                            (containerStamp.type?.includes('source') &&
                                (structure.store.getFreeCapacity() < 300 ||
                                    room.memory.stampLayout.link.find((linkDetail) => containerStamp.type === linkDetail.type)?.rcl >
                                        this.homeroom.controller.level)))
                )
        ) as StructureContainer[];
        const fillingContainers = containers.filter((container) => container.store.getUsedCapacity() >= container.store.getCapacity() / 2);
        if (fillingContainers.length) {
            const container = fillingContainers.reduce((fullestContainer, nextContainer) =>
                fullestContainer.store.getUsedCapacity() > nextContainer.store.getUsedCapacity() ? fullestContainer : nextContainer
            );

            this.debugLog(`found filling container to empty at ${container.pos.toMemSafe()}`);
            return container.id;
        }

        const looseResources = room.find(FIND_DROPPED_RESOURCES);
        const bigLooseResources = looseResources.filter((r) => r.amount > 100 && (room.storage || r.resourceType === RESOURCE_ENERGY));
        if (bigLooseResources.length) {
            const resource = looseResources
                .filter(
                    (r) =>
                        r.amount > 100 &&
                        (room.storage || r.resourceType === RESOURCE_ENERGY) &&
                        !this.room.memory.stampLayout.container.some((stamp) => stamp.type === 'center' && stamp.pos.toRoomPos().isEqualTo(r.pos))
                )
                .reduce((biggestResource, resourceToCompare) =>
                    biggestResource.amount > resourceToCompare.amount ? biggestResource : resourceToCompare
                );

            this.debugLog(`found ${resource.resourceType} to pick up at ${resource.pos.toMemSafe()}`);
            return resource.id;
        }

        const tombstonesWithResources =
            this.room.name === this.homeroom.name && !this.homeroom.storage
                ? room.find(FIND_TOMBSTONES).filter((t) => t.store[RESOURCE_ENERGY])
                : room.find(FIND_TOMBSTONES).filter((t) => t.store.getUsedCapacity() > this.store.getCapacity() / 2);
        if (tombstonesWithResources.length) {
            const tombstone = this.pos.findClosestByPath(tombstonesWithResources, { ignoreCreeps: true, range: 1 });
            this.debugLog(`found tombstone to empty at ${tombstone.pos.toMemSafe()}`);
            return tombstone.id;
        }

        if (containers.length) {
            const container = containers.reduce((fullestContainer, nextContainer) =>
                fullestContainer.store.getUsedCapacity() > nextContainer.store.getUsedCapacity() ? fullestContainer : nextContainer
            );
            this.debugLog(`found container to empty at ${container.pos.toMemSafe()}`);
            return container.id;
        }
        if (looseResources.filter((r) => room.storage || r.resourceType === RESOURCE_ENERGY).length) {
            const resource = looseResources
                .filter((r) => room.storage || r.resourceType === RESOURCE_ENERGY)
                .reduce((most, next) => (most.amount > next.amount ? most : next));

            this.debugLog(`found ${resource.resourceType} to pick up at ${resource.pos.toMemSafe()}`);
            return resource.id;
        }

        this.memory.sleepCollectTil = Game.time + 10;
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage | StructureLab | StructureContainer) {
        this.memory.currentTaskPriority = Priority.HIGH;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (!this.store.energy) {
                this.memory.gathering = this.store.getUsedCapacity() === 0; // Gather energy or drop off minerals
                delete this.memory.targetId;
            } else if (!this.pos.isNearTo(target)) {
                let result = this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                if (this.memory._m.stuckCount && this.memory._m.path.length === 1) {
                    let adjacentManagerAdjacentToTarget = this.room.myCreeps.find(
                        (c) => c.memory.role === Role.MANAGER && this.pos.isNearTo(c) && c.pos.isNearTo(target)
                    );
                    this.transfer(adjacentManagerAdjacentToTarget, RESOURCE_ENERGY);
                }
            } else if (!this.actionTaken) {
                let result = this.transfer(target, RESOURCE_ENERGY);
                switch (result) {
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.memory.gathering = true;
                    case ERR_FULL:
                        this.onTaskFinished();
                        break;
                    case OK:
                        this.actionTaken = true;
                        this.outgoingResourceAmount += Math.min(this.store.energy, targetFreeCapacity);
                        this.onTaskFinished();
                        break;
                }
            }
        } else {
            this.onTaskFinished();
        }
    }

    protected runRefillPowerSpawnJob(target: StructurePowerSpawn) {
        this.memory.currentTaskPriority = Priority.HIGH;
        let targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (targetFreeCapacity) {
            if (!this.store.energy) {
                this.memory.gathering = this.store.getUsedCapacity() === 0; // Gather energy or drop off minerals
                delete this.memory.targetId;
            } else if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
            } else if (!this.actionTaken) {
                let result = this.transfer(target, RESOURCE_ENERGY);
                switch (result) {
                    case ERR_NOT_ENOUGH_RESOURCES:
                        this.memory.gathering = true;
                    case ERR_FULL:
                        this.onTaskFinished();
                        break;
                    case OK:
                        this.actionTaken = true;
                        this.outgoingResourceAmount += Math.min(this.store.energy, targetFreeCapacity);
                        this.onTaskFinished();
                        break;
                }
            }
        } else if (target.store.getFreeCapacity(RESOURCE_POWER)) {
            targetFreeCapacity = target.store.getFreeCapacity(RESOURCE_POWER);
            if (!this.store.power) {
                const target = [this.room.storage, this.room.terminal].find((struct) => struct.store[RESOURCE_POWER]);
                if (!target) {
                    this.onTaskFinished();
                } else if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                } else {
                    let amountToWithdraw = Math.min(targetFreeCapacity, this.store.getFreeCapacity(), target.store.power);
                    let result = this.withdraw(target, RESOURCE_POWER, amountToWithdraw);
                    if (result === OK) {
                        this.incomingMineralAmount += amountToWithdraw;
                    } else {
                        this.onTaskFinished();
                    }
                }
            } else if (!this.pos.isNearTo(target)) {
                this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
            } else if (!this.actionTaken) {
                let result = this.transfer(target, RESOURCE_POWER);
                switch (result) {
                    case ERR_FULL:
                        this.onTaskFinished();
                        break;
                    case OK:
                        this.actionTaken = true;
                        this.outgoingResourceAmount += Math.min(this.store.power, targetFreeCapacity);
                        this.onTaskFinished();
                        break;
                }
            }
        } else {
            this.onTaskFinished();
        }
    }

    //gather resources for the purpose of storing
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone | StructureLab | Ruin): void {
        this.memory.currentTaskPriority = Priority.HIGH;

        let resourcesToWithdraw = this.homeroom.storage
            ? target instanceof StructureLab
                ? [target.mineralType]
                : (Object.keys(target.store) as ResourceConstant[])
            : [RESOURCE_ENERGY];
        if (!this.pos.isNearTo(target)) {
            this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
        } else if (!this.actionTaken) {
            let nextResource: ResourceConstant =
                target instanceof StructureContainer &&
                this.room.memory.stampLayout.container.some((stamp) => stamp.pos === target.pos.toMemSafe() && stamp.type === 'center')
                    ? resourcesToWithdraw.filter((res) => res !== RESOURCE_ENERGY).shift()
                    : resourcesToWithdraw.shift();
            let result = this.withdraw(target, nextResource);
            switch (result) {
                case 0:
                    this.actionTaken = true;
                    if (
                        target.store[nextResource] >= this.store.getFreeCapacity() ||
                        resourcesToWithdraw.length === 0 ||
                        target instanceof StructureLab
                    ) {
                        this.onTaskFinished();
                    }
                    if (nextResource === RESOURCE_ENERGY) {
                        this.incomingEnergyAmount += Math.min(this.store.getFreeCapacity(), target.store[nextResource]);
                    } else {
                        this.incomingMineralAmount += Math.min(this.store.getFreeCapacity(), target.store[nextResource]);
                    }
                    break;
                default:
                    this.onTaskFinished();
                    break;
            }
        }
    }

    protected runPickupJob(resource: Resource): void {
        this.memory.currentTaskPriority = Priority.HIGH;
        if (!this.pos.isNearTo(resource)) {
            this.travelTo(resource, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
        } else if (!this.actionTaken) {
            let result = this.pickup(resource);
            switch (result) {
                case 0:
                    this.actionTaken = true;
                    if (resource.resourceType === RESOURCE_ENERGY) {
                        this.incomingEnergyAmount += resource.amount;
                    } else {
                        this.incomingMineralAmount += resource.amount;
                    }
                case ERR_FULL:
                    this.onTaskFinished();
            }
        }
    }

    protected manageLabs() {
        //check labs in included needs for preparedness
        this.labs = this.memory.labNeeds.map((need) => Game.getObjectById(need.lab));
        const labToClean = this.homeroom.labs.find((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
        const deliveringResources = Object.keys(this.store).some((res) => this.memory.labNeeds.some((need) => need.resource === res));
        if (labToClean && !deliveringResources) {
            this.cleanLab(labToClean);
        } else {
            this.supplyResourcesToLabs();
        }
    }

    protected cleanLab(labToClean: StructureLab) {
        this.memory.currentTaskPriority = Priority.HIGH;
        if (this.store.getFreeCapacity() === 0 || (this.store.getUsedCapacity() && this.pos.isNearTo(this.homeroom.storage))) {
            this.storeCargo();
        } else {
            if (this.pos.isNearTo(labToClean)) {
                const amountInLab = labToClean.store[labToClean.mineralType];
                this.withdraw(labToClean, labToClean.mineralType);
                if (this.store.getFreeCapacity() + amountInLab < this.store.getCapacity()) {
                    const nextLabToClean = this.homeroom.labs.find((lab) => lab.status === LabStatus.NEEDS_EMPTYING && lab !== labToClean);
                    if (nextLabToClean) {
                        this.travelTo(nextLabToClean, { range: 1 });
                    } else {
                        this.travelTo(this.homeroom.storage);
                    }
                }
            } else {
                this.travelTo(labToClean, { range: 1 });
            }
        }
    }

    protected supplyResourcesToLabs() {
        this.memory.currentTaskPriority = Priority.HIGH;

        if (this.memory.gatheringLabResources) {
            let resourceList: { [resource: string]: number } = {};
            this.memory.labNeeds.forEach((need) => {
                !resourceList[need.resource] ? (resourceList[need.resource] = need.amount) : (resourceList[need.resource] += need.amount);
            });

            if (Object.keys(this.store).some((res) => !resourceList[res])) {
                this.storeCargo();
                return;
            }

            let totalAmountToGather = Math.min(
                this.store.getCapacity(),
                Object.values(resourceList).reduce((sum, next) => sum + next)
            );

            if (this.store.getUsedCapacity() >= totalAmountToGather) {
                this.memory.gatheringLabResources = false;
            } else {
                let resourceToGather = Object.keys(resourceList).find((res) => resourceList[res] > this.store[res]) as ResourceConstant;

                let target = [this.room.storage, this.room.terminal].find((struct) => struct.store[resourceToGather]);
                if (!target) {
                    const labIdForNeed = this.memory.labNeeds.find((need) => need.resource === resourceToGather)?.lab;
                    const taskIdToCancel = Game.getObjectById(labIdForNeed)?.taskId;
                    delete this.memory.labNeeds;
                    delete this.homeroom.memory.labTasks[taskIdToCancel];
                    console.log(`${Game.time} - LabTask ${taskIdToCancel} in ${this.memory.room} cancelled`);
                } else if (!this.pos.isNearTo(target)) {
                    this.travelTo(target, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                } else {
                    let amountToWithdraw = Math.min(
                        resourceList[resourceToGather] - this.store[resourceToGather],
                        this.store.getFreeCapacity(),
                        target.store[resourceToGather]
                    );
                    let result = this.withdraw(target, resourceToGather, amountToWithdraw);
                    if (result === OK) {
                        if (amountToWithdraw + this.store.getUsedCapacity() >= totalAmountToGather) {
                            this.memory.gatheringLabResources = false;
                        }
                    } else {
                        this.say('e');
                    }
                }
            }
        } else {
            //check in-memory need validity
            const labToCheck = Game.getObjectById(this.memory.labNeeds[0].lab);
            if (!labToCheck?.taskId || labToCheck.status === LabStatus.NEEDS_EMPTYING) {
                this.memory.labNeeds.shift();
            }

            if (this.store.getUsedCapacity(this.memory.labNeeds[0]?.resource)) {
                const nextNeed = this.memory.labNeeds[0];
                const targetLab: StructureLab = Game.getObjectById(nextNeed.lab);
                if (!this.pos.isNearTo(targetLab)) {
                    this.travelTo(targetLab, { range: 1, currentTickEnergy: this.incomingEnergyAmount + this.incomingMineralAmount });
                } else {
                    const amountToTransfer = Math.min(
                        nextNeed.amount,
                        this.store[nextNeed.resource],
                        targetLab.store.getFreeCapacity(nextNeed.resource)
                    );
                    let result = this.transfer(targetLab, nextNeed.resource, amountToTransfer);
                    if (result === OK) {
                        const labTaskId = targetLab.taskId;
                        const needIndex = this.homeroom.memory.labTasks[labTaskId].needs.findIndex((need) => need.resource === nextNeed.resource);
                        if (needIndex > -1) {
                            this.homeroom.memory.labTasks[labTaskId].needs[needIndex].amount -= amountToTransfer;
                            this.memory.labNeeds[0].amount -= amountToTransfer;
                            if (this.memory.labNeeds[0].amount <= 0) {
                                this.memory.labNeeds.shift();
                                if (this.store.getUsedCapacity() - amountToTransfer === 0) {
                                    this.memory.gatheringLabResources = true;
                                }
                            }
                        }
                    } else {
                        this.debugLog(`hit error working lab task: ${result}`);
                        switch (result) {
                            case ERR_FULL:
                                const needIndex = this.homeroom.memory.labTasks[targetLab.taskId].needs.findIndex(
                                    (need) => need.resource === targetLab.mineralType && need.lab === targetLab.id
                                );
                                if (needIndex > -1) {
                                    this.homeroom.memory.labTasks[targetLab.taskId].needs[needIndex].amount = 0;
                                    this.memory.labNeeds[0].amount = 0;
                                    this.memory.labNeeds.shift();
                                    break;
                                }
                            default:
                                let labTaskId = targetLab.taskId;
                                delete this.homeroom.memory.labTasks[labTaskId];
                                delete this.memory.labNeeds;
                                delete this.memory.gatheringLabResources;
                                this.debugLog(`clearing lab task ${labTaskId} in ${this.homeroom.name}`);
                                break;
                        }
                    }

                    if (!this.memory.labNeeds.length) {
                        delete this.memory.gatheringLabResources;
                    }
                }
            } else {
                this.memory.gatheringLabResources = true;
            }
        }
    }

    protected claimLabRequests() {
        let availableCapacity = this.store.getFreeCapacity();
        const needs: LabNeed[] = _.flatten(
            Object.values(this.homeroom.memory.labTasks)
                .filter((task) => [TaskStatus.PREPARING, TaskStatus.ACTIVE].includes(task.status))
                .map((task) => task.needs)
        ).filter((need) => need.amount > 0);
        let i: number;
        for (i = 0; availableCapacity > 0 && i < needs.length; i++) {
            availableCapacity -= needs[i].amount;
        }

        this.memory.labNeeds = needs;
        this.memory.gatheringLabResources = true;
    }

    protected onTaskFinished(): void {
        this.debugLog(`task finished`);
        this.previousTargetId = this.memory.targetId;
        delete this.memory.currentTaskPriority;
        delete this.memory.task;
        delete this.memory.targetId;
        delete this.memory.dropPos;
    }

    protected findCargoStorage(): Id<Structure> | RoomPosition {
        if (this.room.storage) {
            return this.room.storage.id;
        } else if (this.room.spawns.some((spawn) => spawn.store.getFreeCapacity(RESOURCE_ENERGY))) {
            return this.room.spawns.find((spawn) => spawn.store.getFreeCapacity(RESOURCE_ENERGY)).id;
        } else {
            const centerContainerStamps = this.room.memory.stampLayout.container.filter((stamp) => stamp.type === 'center');
            const containerToFill = centerContainerStamps
                .map((stamp) =>
                    stamp.pos
                        .toRoomPos()
                        .lookFor(LOOK_STRUCTURES)
                        .find((s: StructureContainer) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity())
                )
                .find((s) => !!s);
            if (containerToFill) {
                return containerToFill.id;
            } else {
                return centerContainerStamps.pop()?.pos.toRoomPos();
            }
        }
    }

    protected runDropoff() {
        this.memory.currentTaskPriority = Priority.HIGH;
        const dropPos = this.memory.dropPos?.toRoomPos();
        if (!dropPos) {
            this.onTaskFinished();
        }
        if (!dropPos.isEqualTo(this.pos)) {
            this.travelTo(dropPos);
        } else {
            let resourceToDrop = Object.keys(this.store).pop() as ResourceConstant;
            if (resourceToDrop) {
                this.drop(resourceToDrop);
            }
            this.onTaskFinished();
        }
    }
}
