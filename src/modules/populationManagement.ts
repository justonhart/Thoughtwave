import { isCenterRoom, isKeeperRoom as isKeeperRoom } from './data';
import { getBoostsAvailable } from './labManagement';
import { getResourceAvailability } from './resourceManagement';
import { roadIsPaved, roadIsSafe } from './roads';
import { getStoragePos, roomNeedsCoreStructures } from './roomDesign';

const BODY_TO_BOOST_MAP: { [key in BoostType]: BodyPartConstant } = {
    [BoostType.ATTACK]: ATTACK,
    [BoostType.RANGED_ATTACK]: RANGED_ATTACK,
    [BoostType.HEAL]: HEAL,
    [BoostType.HARVEST]: WORK,
    [BoostType.BUILD]: WORK,
    [BoostType.UPGRADE]: WORK,
    [BoostType.DISMANTLE]: WORK,
    [BoostType.MOVE]: MOVE,
    [BoostType.CARRY]: CARRY,
    [BoostType.TOUGH]: TOUGH,
};

const BOOST_RESOURCE_MAP: { [key in BoostType]: ResourceConstant } = {
    [BoostType.ATTACK]: RESOURCE_CATALYZED_UTRIUM_ACID,
    [BoostType.HARVEST]: RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
    [BoostType.CARRY]: RESOURCE_CATALYZED_KEANIUM_ACID,
    [BoostType.RANGED_ATTACK]: RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
    [BoostType.BUILD]: RESOURCE_CATALYZED_LEMERGIUM_ACID,
    [BoostType.HEAL]: RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
    [BoostType.DISMANTLE]: RESOURCE_CATALYZED_ZYNTHIUM_ACID,
    [BoostType.MOVE]: RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
    [BoostType.UPGRADE]: RESOURCE_CATALYZED_GHODIUM_ACID,
    [BoostType.TOUGH]: RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
};

const ROLE_TAG_MAP: { [key in Role]: string } = {
    [Role.CLAIMER]: 'cl',
    [Role.COLONIZER]: 'col',
    [Role.DISTRIBUTOR]: 'd',
    [Role.GATHERER]: 'g',
    [Role.WORKER]: 'w',
    [Role.GO]: 'go',
    [Role.INTERSHARD_TRAVELLER]: 'i',
    [Role.MANAGER]: 'mg',
    [Role.MINERAL_MINER]: 'mm',
    [Role.MINER]: 'm',
    [Role.OPERATIVE]: 'o',
    [Role.PROTECTOR]: 'p',
    [Role.RAMPART_PROTECTOR]: 'rp',
    [Role.RESERVER]: 'rs',
    [Role.SCOUT]: 'sc',
    [Role.SQUAD_ATTACKER]: 'a',
    [Role.TRANSPORTER]: 't',
    [Role.UPGRADER]: 'u',
    [Role.REMOTE_MINER]: 'rm',
    [Role.KEEPER_EXTERMINATOR]: 'e',
    [Role.REMOTE_MINERAL_MINER]: 'rmm',
};

export class PopulationManagement {
    static spawnWorker(spawn: StructureSpawn, roomUnderAttack?: boolean): ScreepsReturnCode {
        const INCOMING_NUKE = spawn.room.find(FIND_NUKES).length > 0;
        let workers = spawn.room.creeps.filter((creep) => creep.memory.role === Role.WORKER);
        let hasUpgrader = spawn.room.creeps.some((c) => c.memory.role === Role.UPGRADER);
        let roomNeedsConstruction =
            spawn.room.memory.repairQueue.length + spawn.room.find(FIND_MY_CONSTRUCTION_SITES).length > 0 || spawn.room.memory.needsWallRepair;

        let workerCount = workers.length + (hasUpgrader ? 1 : 0);

        let options: SpawnOptions = {
            boosts: roomUnderAttack || INCOMING_NUKE ? [BoostType.BUILD] : [],
            memory: {
                room: spawn.room.name,
                role: Role.WORKER,
            },
        };

        // Increase during siege for more repair creeps
        let canSupportAnotherWorker =
            workerCount < spawn.room.workerCapacity + ((roomUnderAttack || INCOMING_NUKE) && spawn.room.workerCapacity < 3 ? 1 : 0);

        let spawnUpgrader =
            !roomUnderAttack &&
            canSupportAnotherWorker &&
            !INCOMING_NUKE &&
            !hasUpgrader &&
            !roomNeedsConstruction &&
            !roomNeedsCoreStructures(spawn.room);

        const WORKER_PART_BLOCK = [WORK, CARRY, MOVE];
        let creepLevelCap = 16;
        if (spawnUpgrader) {
            options.memory.role = Role.UPGRADER;
            options.boosts = spawn.room.controller.level < 8 ? [BoostType.UPGRADE] : [];
            let result: ScreepsReturnCode;

            if (spawn.room.upgraderLink) {
                let body = this.createPartsArray([WORK, WORK, WORK, CARRY, MOVE, MOVE], spawn.room.energyCapacityAvailable, 5);
                result = spawn.smartSpawn(body, this.generateName(options.memory.role, spawn.name), options);
            } else {
                result = spawn.spawnMax([WORK, CARRY, MOVE], this.generateName(options.memory.role, spawn.name), options);
            }

            return result;
        } else if (canSupportAnotherWorker) {
            let result = spawn.spawnMax(WORKER_PART_BLOCK, this.generateName(options.memory.role, spawn.name), options, creepLevelCap);
            return result;
        } else {
            //check to see if there are any creeps to replace w/ stronger models
            let maxSize = this.createPartsArray(WORKER_PART_BLOCK, spawn.room.energyCapacityAvailable, creepLevelCap).length;
            let creepToReplace = workers.find((creep) => creep.getActiveBodyparts(WORK) < maxSize / 3);
            if (creepToReplace) {
                let result = spawn.spawnMax(WORKER_PART_BLOCK, this.generateName(options.memory.role, spawn.name), options, creepLevelCap);
                if (result === OK) {
                    creepToReplace.suicide();
                }
                return result;
            }
        }
    }

    //find the number of workers a phase-two room can support
    static calculateWorkerCapacity(room: Room): number {
        //a "cycle" is 300 ticks - the amount of time a source takes to recharge
        const CYCLE_LENGTH = 300;

        //base values
        const sourceCount = room.find(FIND_SOURCES).length;
        const energyCapacity = room.energyCapacityAvailable;

        // avg distance from storagepos to sources
        let energySourceDistance = room.memory.energyDistance ?? 25;

        // distance from storagepos to controller
        let controllerDistance = room.memory.controllerDistance ?? 25;

        let travelDistance = room.storage ? controllerDistance : controllerDistance + energySourceDistance;

        let sourceIncomePerCycle = sourceCount * 3000;
        let remoteIncomePerCycle = 0; //define this once we get remote harvesting working

        let totalIncomePerCycle = sourceIncomePerCycle + remoteIncomePerCycle;

        //cost to create [WORK, CARRY, MOVE] is 200 energy - the largest a creep can be is 50 parts - stop at 45
        let maxPartsBlockPerCreep = Math.min(Math.floor(energyCapacity / 200), 15);

        let energyConsumedPerTrip = 50 * maxPartsBlockPerCreep;

        // 50 carry : 1 work
        let ticksTakenPerTrip = 50 + travelDistance;
        let tripsPerCycle = CYCLE_LENGTH / ticksTakenPerTrip;

        //assuming there are no construction / maintenance jobs, all workers should be upgrading
        let upgadeWorkCostPerCyclePerCreep = energyConsumedPerTrip * tripsPerCycle;

        let spawnCost = maxPartsBlockPerCreep * 200;

        //creeps live for 1500 ticks -> 5 cycles
        let spawnCostPerCyclePerCreep = spawnCost / 5;
        let energyExpenditurePerCyclePerCreep = spawnCostPerCyclePerCreep + upgadeWorkCostPerCyclePerCreep;

        let creepCapacity = Math.max(Math.floor(totalIncomePerCycle / energyExpenditurePerCyclePerCreep), 1);

        switch (room.energyStatus) {
            case EnergyStatus.CRITICAL:
                return 0;
            case EnergyStatus.RECOVERING:
                creepCapacity = Math.ceil(creepCapacity / 2);
                break;
            case EnergyStatus.STABLE:
                break;
            case EnergyStatus.SURPLUS:
                creepCapacity *= 2;
                break;
            case EnergyStatus.OVERFLOW:
                creepCapacity *= 4;
                break;
            //room has no storage
            default:
                let hasStartupEnergy =
                    room
                        .find(FIND_STRUCTURES)
                        .filter(
                            (struct) =>
                                (struct.structureType === STRUCTURE_STORAGE || struct.structureType === STRUCTURE_TERMINAL) &&
                                struct.store.energy > 200000
                        ).length > 0;
                if (hasStartupEnergy) {
                    creepCapacity *= 4;
                }
        }

        return creepCapacity;
    }

    static needsMiner(room: Room): boolean {
        let roomNeedsMiner = Object.values(room.memory.miningAssignments).some((assignment) => assignment === AssignmentStatus.UNASSIGNED);
        // if (!roomNeedsMiner) {
        //     // Check for TTL
        //     roomNeedsMiner = room.creeps.some(
        //         (creep) =>
        //             creep.memory.role === Role.MINER &&
        //             creep.memory.room === room.name &&
        //             !creep.memory.hasTTLReplacement &&
        //             creep.ticksToLive <
        //                 PopulationManagement.getMinerBody(creep.memory.assignment.toRoomPos(), room.energyCapacityAvailable).length * 3
        //     );
        // }
        return roomNeedsMiner;
    }

    static getMinerBody(miningPos: RoomPosition, energyCapacityAvailable: number, powerLevel: number = 0): (WORK | MOVE | CARRY)[] {
        let minerBody: (WORK | MOVE | CARRY)[] = [];

        const minerStructures = miningPos
            .findInRange(FIND_MY_STRUCTURES, 1)
            .filter((s) => s.structureType === STRUCTURE_LINK || s.structureType === STRUCTURE_EXTENSION);
        if (Memory.rooms[miningPos.roomName].layout === RoomLayout.STAMP) {
            if (minerStructures.some((minerStructure) => minerStructure.structureType === STRUCTURE_EXTENSION)) {
                if (energyCapacityAvailable >= 850) {
                    minerBody = [CARRY, CARRY, CARRY];
                } else {
                    minerBody = [CARRY];
                }
            }
        } else if (minerStructures.some((minerStructure) => minerStructure.structureType === STRUCTURE_LINK)) {
            minerBody = [CARRY];
        }
        energyCapacityAvailable -= minerBody.length * 50;
        let numAdditionalWork = Math.ceil((powerLevel * 3.33) / 2);
        if (powerLevel && numAdditionalWork && energyCapacityAvailable >= numAdditionalWork * 100 + Math.floor(numAdditionalWork / 2) * 50 + 650) {
            let powerCreepBodyParts = [];
            while (numAdditionalWork > 0) {
                powerCreepBodyParts.push(WORK);
                if (powerCreepBodyParts.filter((part) => part === WORK).length % 2 === 0) {
                    powerCreepBodyParts.push(MOVE);
                }
                numAdditionalWork--;
            }
            minerBody = minerBody.concat([WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE]).concat(powerCreepBodyParts);
        } else if (energyCapacityAvailable >= 650) {
            minerBody = minerBody.concat([WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE]);
        } else if (energyCapacityAvailable >= 550) {
            minerBody = minerBody.concat([WORK, WORK, WORK, WORK, WORK, MOVE]);
        } else if (energyCapacityAvailable >= 450) {
            minerBody = minerBody.concat([WORK, WORK, WORK, WORK, MOVE]);
        } else if (energyCapacityAvailable >= 350) {
            minerBody = minerBody.concat([WORK, WORK, WORK, MOVE]);
        } else {
            minerBody = minerBody.concat([WORK, WORK, MOVE]);
        }

        return minerBody;
    }

    static spawnMiner(spawn: StructureSpawn): ScreepsReturnCode {
        let assigmentKeys = Object.keys(spawn.room.memory.miningAssignments);
        let assigment = assigmentKeys.find((pos) => spawn.room.memory.miningAssignments[pos] === AssignmentStatus.UNASSIGNED);
        let currentMiner: Creep;
        // if (!assigment) {
        //     // Check for TTL
        //     currentMiner = spawn.room.creeps.find(
        //         (creep) =>
        //             creep.memory.role === Role.MINER &&
        //             creep.memory.room === spawn.room.name &&
        //             creep.ticksToLive <
        //                 PopulationManagement.getMinerBody(creep.memory.assignment.toRoomPos(), spawn.room.energyCapacityAvailable).length * 3
        //     );
        //     assigment = currentMiner?.memory.assignment;
        // }

        let options: SpawnOptions = {
            memory: {
                assignment: assigment,
                room: spawn.room.name,
                role: Role.MINER,
            },
        };

        let assigmentPos = assigment.toRoomPos();
        let link = assigmentPos.findInRange(FIND_MY_STRUCTURES, 1).find((s) => s.structureType === STRUCTURE_LINK) as StructureLink;
        if (link) {
            options.memory.link = link.id;
        }

        let name = this.generateName(options.memory.role, spawn.name);

        let powerLevel = 0;
        const sourceWithPower = assigmentPos
            .findInRange(FIND_SOURCES, 1)
            .find((source) => source.effects?.some((effect) => effect.effect === PWR_REGEN_SOURCE)) as Source;
        if (sourceWithPower) {
            powerLevel = (sourceWithPower.effects.find((effect) => effect.effect === PWR_REGEN_SOURCE) as PowerEffect).level;
        }
        let result = spawn.smartSpawn(PopulationManagement.getMinerBody(assigmentPos, spawn.room.energyCapacityAvailable, powerLevel), name, options);
        if (result === OK) {
            if (currentMiner) {
                currentMiner.memory.hasTTLReplacement = true;
            }
            spawn.room.memory.miningAssignments[assigment] = name;
        } else if (
            result === ERR_NOT_ENOUGH_ENERGY &&
            !spawn.room.find(FIND_MY_CREEPS).filter((creep) => creep.memory.role === Role.MINER).length &&
            (!spawn.room.storage || spawn.room.storage?.store[RESOURCE_ENERGY] < 1000)
        ) {
            let emergencyMinerBody: (WORK | MOVE | CARRY)[] = [WORK, WORK, MOVE];
            if (spawn.room.memory.layout === RoomLayout.STAMP) {
                emergencyMinerBody.unshift(CARRY);
            }
            result = spawn.smartSpawn(emergencyMinerBody, name, options);
            if (result === OK) {
                if (currentMiner) {
                    currentMiner.memory.hasTTLReplacement = true;
                }
                spawn.room.memory.miningAssignments[assigment] = name;
            }
        }

        return result;
    }

    static findRemoteMinerNeed(room: Room): string {
        return room.remoteSources.find(
            (s) =>
                room.memory.remoteSources[s].miner === AssignmentStatus.UNASSIGNED &&
                [RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.VACANT].includes(Memory.roomData[s.toRoomPos().roomName].roomStatus) &&
                Memory.remoteData[s.toRoomPos().roomName].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[s.toRoomPos().roomName].reservationState !== RemoteRoomReservationStatus.ENEMY &&
                roadIsSafe(`${getStoragePos(room).toMemSafe()}:${room.memory.remoteSources[s].miningPos}`)
        );
    }

    static spawnRemoteMiner(spawn: StructureSpawn, source: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: source,
                room: spawn.room.name,
                role: Role.REMOTE_MINER,
                currentTaskPriority: Priority.HIGH,
            },
        };

        let workNeeded = this.calculateRemoteMinerWorkNeeded(source);
        let work = [];
        let move = [];
        let energyLeft = spawn.room.energyCapacityAvailable - 100;
        let needMove = 1;
        while (work.length < workNeeded && energyLeft >= (needMove === 1 ? 150 : 100)) {
            work.push(WORK);
            energyLeft -= 100;
            needMove++;
            if (needMove === 2) {
                move.push(MOVE);
                energyLeft -= 50;
                needMove = 0;
            }
        }

        let minerBody = [...work, ...move, CARRY, MOVE];
        let name = this.generateName(options.memory.role, spawn.name);

        let result = spawn.smartSpawn(minerBody, name, options);
        if (result === OK) {
            spawn.room.memory.remoteSources[source].miner = name;
        }

        return result;
    }

    static findGathererNeed(room: Room): string {
        return room.remoteSources.find(
            (s) =>
                Memory.roomData[s.toRoomPos().roomName].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[s.toRoomPos().roomName].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[s.toRoomPos().roomName].reservationState !== RemoteRoomReservationStatus.ENEMY &&
                room.memory.remoteSources[s].setupStatus !== RemoteSourceSetupStatus.BUILDING_CONTAINER &&
                room.memory.remoteSources[s].gatherers.some((g) => g === AssignmentStatus.UNASSIGNED) &&
                roadIsSafe(`${getStoragePos(room).toMemSafe()}:${room.memory.remoteSources[s].miningPos}`)
        );
    }

    static spawnGatherer(spawn: StructureSpawn, source: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: source,
                room: spawn.room.name,
                role: Role.GATHERER,
            },
        };

        let name = this.generateName(options.memory.role, spawn.name);

        //if road is marked as in-progress, check to see if it is done
        if (spawn.room.memory.remoteSources[source].setupStatus === RemoteSourceSetupStatus.BUILDING_ROAD) {
            let roadFinished = roadIsPaved(`${getStoragePos(spawn.room).toMemSafe()}:${spawn.room.memory.remoteSources[source].miningPos}`);
            if (roadFinished === true) {
                delete spawn.room.memory.remoteSources[source].setupStatus;
            }
        }

        let PARTS =
            spawn.room.memory.remoteSources[source].setupStatus === RemoteSourceSetupStatus.BUILDING_ROAD
                ? PopulationManagement.createPartsArray([WORK, CARRY, MOVE], spawn.room.energyCapacityAvailable, 10)
                : [
                      WORK,
                      WORK,
                      CARRY,
                      CARRY,
                      MOVE,
                      ...PopulationManagement.createPartsArray([CARRY, CARRY, CARRY, CARRY, MOVE], spawn.room.energyCapacityAvailable - 350, 9),
                  ];

        // let PARTS = [
        //     WORK,
        //     WORK,
        //     CARRY,
        //     CARRY,
        //     MOVE,
        //     ...PopulationManagement.createPartsArray([CARRY, CARRY, CARRY, CARRY, MOVE], spawn.room.energyCapacityAvailable - 350, 9),
        // ];
        let result = spawn.smartSpawn(PARTS, name, options);

        if (result === OK) {
            let unassignedIndex = spawn.room.memory.remoteSources[source].gatherers.findIndex((g) => g === AssignmentStatus.UNASSIGNED);
            if (unassignedIndex !== -1) {
                spawn.room.memory.remoteSources[source].gatherers[unassignedIndex] = name;
            }
        }

        return result;
    }

    static findReserverNeed(room: Room): string {
        return room.remoteSources
            .find(
                (remoteSource) =>
                    Memory.roomData[remoteSource.split('.')[2]].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                    Memory.remoteData[remoteSource.split('.')[2]].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                    Memory.remoteData[remoteSource.split('.')[2]].reserver === AssignmentStatus.UNASSIGNED &&
                    roadIsSafe(`${getStoragePos(room).toMemSafe()}:${Memory.rooms[room.name].remoteSources[remoteSource].miningPos}`)
            )
            ?.split('.')[2];
    }

    static spawnReserver(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: remoteRoomName,
                room: spawn.room.name,
                role: Role.RESERVER,
            },
        };

        let maxSize = 5;
        if (Memory.remoteData[remoteRoomName].reservationState === RemoteRoomReservationStatus.STABLE) {
            maxSize = 1;
        }

        const PARTS = [CLAIM, MOVE];
        let name = this.generateName(options.memory.role, spawn.name);
        let result = spawn.spawnMax(PARTS, name, options, maxSize);

        if (result === OK) {
            Memory.remoteData[remoteRoomName].reserver = name;
        }

        return result;
    }

    // generates creep bodies by repeating a defined pattern up to n times, where n = levelCap
    static createPartsArray(partsBlock: BodyPartConstant[], energyCapacityAvailable: number, levelCap: number = 15): BodyPartConstant[] {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (let i = 0; i < Math.floor(energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length <= 50 && i < levelCap; i++) {
            partsArray = partsArray.concat(partsBlock);
        }

        return partsArray;
    }

    /**
     * Create a creep body until damage needed is reached up to max body size. It will boost all creep parts if possible.
     * Supports: ATTACK, RANGED_ATTACK, HEAL, TOUGH, MOVE
     *
     * @param room room which will be used to spawn creep
     * @param parts Unique Body parts (method will determine how much you need of each for you)
     * @param damageNeeded damage creep should be able to output
     * @param opts normal spawnOptions
     * @returns Creep Body Part Array
     */
    public static createDynamicCreepBody(
        room: Room,
        parts: BodyPartConstant[],
        damageNeeded: number,
        healNeeded: number,
        opts?: SpawnOptions
    ): BodyPartConstant[] {
        const getSortValue = (part: BodyPartConstant): number => (part === MOVE ? 2 : part === TOUGH ? 1 : 0);
        parts = parts.filter((part, index) => parts.indexOf(part) === index).sort((a, b) => getSortValue(b) - getSortValue(a));
        let energyAvailable = room.energyCapacityAvailable;
        let hasEnergyLeft = true;
        let partsArray = [];

        const needed: BodyPartsNeeded = { damage: damageNeeded, move: 0, heal: 0, tough: 0, calculatedTough: false, boostedTough: false };
        if (parts.some((part) => part === HEAL)) {
            needed.heal = healNeeded;
        }
        // ToughNeeded is calculated after knowing which boost is used
        if (parts.some((part) => part === TOUGH) && healNeeded > 0) {
            needed.tough = 1;
        }

        if (opts?.boosts) {
            var boostMap = getBoostsAvailable(room, Array.from(opts.boosts));
        }

        while (hasEnergyLeft && partsArray.length < 50 && (needed.damage > 0 || needed.heal > 0 || needed.tough > 0 || needed.move > 0)) {
            parts = parts.filter(
                (part) =>
                    ((part === ATTACK || part === RANGED_ATTACK) && needed.damage > 0) ||
                    (part === HEAL && needed.heal > 0) ||
                    (part === TOUGH && needed.tough > 0) ||
                    part === MOVE
            );

            let boostTracker = room.getBoostsAvailable(opts?.boosts ?? []);
            parts.forEach((part) => {
                if (partsArray.length === 50) {
                    return;
                }
                if (energyAvailable < BODYPART_COST[part]) {
                    hasEnergyLeft = false;
                    return; // no more energy
                }

                if (part !== MOVE && needed.move > -1) {
                    return; // First add a MOVE part
                }
                if (part === MOVE && needed.move < 0) {
                    return; // Move not currently needed
                }

                if (part !== MOVE) {
                    needed.move++;
                }

                let boostFound = false;
                if (opts?.boosts?.length) {
                    opts.boosts
                        .filter((boostType) => part === BODY_TO_BOOST_MAP[boostType])
                        .forEach((boostType) => {
                            let boostsAvailableCount = boostTracker[boostType];
                            if (boostsAvailableCount) {
                                boostTracker[boostType] -= 1;
                                const tierBoost = 3;
                                this.updateNeededValues(part, needed, tierBoost);
                                boostFound = true;
                            }
                        });
                }
                if (!boostFound) {
                    this.updateNeededValues(part, needed);
                }
                if (part === TOUGH && !needed.boostedTough) {
                    // Do not allow nonBoosted TOUGH parts
                    needed.tough = 0;
                    return;
                }
                energyAvailable -= BODYPART_COST[part];
                partsArray.push(part);
            });
        }

        return partsArray;
    }

    private static updateNeededValues(part: BodyPartConstant, needed: BodyPartsNeeded, tierBoost: number = 1) {
        needed.damage -= this.getDamage(part, tierBoost);
        needed.heal -= this.getHeal(part, tierBoost);
        needed.move -= this.getMove(part, tierBoost);
        if (part === TOUGH) {
            if (!needed.calculatedTough) {
                needed.calculatedTough = true;
                needed.boostedTough = tierBoost > 1;
                needed.heal *= this.getTough(part, tierBoost);
                needed.tough = Math.ceil(needed.heal / 100);
            }
            needed.tough--;
        }
    }

    private static getDamage(part: BodyPartConstant, boostTier: number) {
        if (part === RANGED_ATTACK) {
            return RANGED_ATTACK_POWER * boostTier;
        } else if (part === ATTACK) {
            return ATTACK_POWER * boostTier;
        }
        return 0;
    }

    private static getHeal(part: BodyPartConstant, boostTier: number) {
        if (part === HEAL) {
            return HEAL_POWER * boostTier;
        }
        return 0;
    }

    private static getTough(part: BodyPartConstant, boostTier: number) {
        return boostTier === 2 ? 0.7 : boostTier === 3 ? 0.5 : boostTier === 4 ? 0.3 : 1;
    }

    private static getMove(part: BodyPartConstant, boostTier: number) {
        if (part === MOVE) {
            return 1 * boostTier;
        }
        return 0;
    }

    static spawnAssignedCreep(spawn: StructureSpawn, assignment: SpawnAssignment): ScreepsReturnCode {
        let options: SpawnOptions = {
            ...assignment.spawnOpts,
        };

        let result = spawn.smartSpawn(assignment.body, this.generateName(options.memory.role, spawn.name), options);
        if (result === OK) {
            const ASSIGNMENT_INDEX = Memory.spawnAssignments.findIndex((a) => a === assignment);
            Memory.spawnAssignments.splice(ASSIGNMENT_INDEX, 1);
        }

        return result;
    }

    static spawnDistributor(spawn: StructureSpawn): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.DISTRIBUTOR,
            },
        };

        const PARTS = [CARRY, CARRY, MOVE];
        let result = spawn.spawnMax(PARTS, this.generateName(options.memory.role, spawn.name), options, 10);

        if (result === ERR_NOT_ENOUGH_ENERGY) {
            result = spawn.spawnFirst(PARTS, this.generateName(options.memory.role, spawn.name), options, 10);
        }

        return result;
    }

    static getAdditionalUpgraderCount(room: Room): number {
        let storedEnergy = room.storage?.store[RESOURCE_ENERGY];

        if (storedEnergy > 400000) {
            return 2;
        } else if (storedEnergy > 200000) {
            return 1;
        }
        return 0;
    }

    static generateName(role: Role, spawnName: string): string {
        return ROLE_TAG_MAP[role] + Game.shard.name.slice(-1) + spawnName.substring(5) + Game.time.toString().slice(-4);
    }

    // spawn the largest creep possible as calculated with spawn.energyAvailable
    static spawnFirst(
        spawn: StructureSpawn,
        partsBlock: BodyPartConstant[],
        name: string,
        opts?: SpawnOptions,
        levelCap: number = 15
    ): ScreepsReturnCode {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (
            let i = 0;
            i < Math.floor((spawn.room.energyAvailable - (spawn.room.memory.reservedEnergy ?? 0)) / partsBlockCost) &&
            (i + 1) * partsBlock.length <= 50 &&
            i < levelCap;
            i++
        ) {
            partsArray = partsArray.concat(partsBlock);
        }

        if (!partsArray.length) {
            return ERR_NOT_ENOUGH_ENERGY;
        }

        return spawn.smartSpawn(partsArray, this.generateName(opts.memory.role, spawn.name), opts);
    }

    // spawn the largest creep possible as calculated with spawn.energyCapacityAvailable
    static spawnMax(
        spawn: StructureSpawn,
        partsBlock: BodyPartConstant[],
        name: string,
        opts?: SpawnOptions,
        levelCap: number = 15
    ): ScreepsReturnCode {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (
            let i = 0;
            i < Math.floor(spawn.room.energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length <= 50 && i < levelCap;
            i++
        ) {
            partsArray = partsArray.concat(partsBlock);
        }

        return spawn.smartSpawn(partsArray, this.generateName(opts.memory.role, spawn.name), opts);
    }

    static smartSpawn(spawn: StructureSpawn, name: string, body: BodyPartConstant[], opts?: SpawnOptions) {
        let partsArrayCost = body.length ? body.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost) : 0;

        if (partsArrayCost > spawn.room.energyAvailable - (spawn.room.memory.reservedEnergy ?? 0)) {
            return ERR_NOT_ENOUGH_ENERGY;
        }

        let labTasksToAdd: LabTaskPartial[] = [];
        let requestsToAdd: ResourceRequestPartial[] = [];

        this.setLabTasksAndRequests(spawn.room, name, body, labTasksToAdd, requestsToAdd, opts);

        // find safe spawn direction in predefined layouts
        if (spawn.room.memory?.layout === RoomLayout.BUNKER) {
            if (!opts.directions) {
                let anchorPoint = spawn.room.memory.anchorPoint.toRoomPos();

                if (spawn.pos.x - anchorPoint.x === 0) {
                    opts.directions = [TOP_LEFT, TOP_RIGHT];
                } else if (spawn.pos.x - anchorPoint.x === -1) {
                    opts.directions = [TOP_LEFT, TOP, LEFT];
                } else if (spawn.pos.x - anchorPoint.x === 2) {
                    opts.directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM];
                }
            }
        }

        if (!opts.disableSort) {
            const getSortValue = (part: BodyPartConstant): number => {
                switch (part) {
                    case TOUGH:
                        return 5;
                    case RANGED_ATTACK:
                    case ATTACK:
                        return 4;
                    case WORK:
                        return 3;
                    case CARRY:
                        return 2;
                    case MOVE:
                        return 1;
                    case CLAIM:
                    case HEAL:
                        return 0;
                }
            };

            body = body.sort((a, b) => getSortValue(b) - getSortValue(a));
        }

        // Prioritize center and miner sources (all others are randomly selected)
        if (spawn.room.memory.stampLayout) {
            const prioritizedExtensions = spawn.room.memory.stampLayout.extension.filter(
                (extensionDetail) => extensionDetail.type?.includes('source') || extensionDetail.type === 'center'
            );
            opts.energyStructures = spawn.room
                .find(FIND_MY_STRUCTURES)
                .filter((structure) => structure.structureType === STRUCTURE_SPAWN || structure.structureType === STRUCTURE_EXTENSION)
                .sort((structA, structB) => {
                    if (structA.structureType === STRUCTURE_SPAWN) {
                        return -1;
                    }

                    if (structB.structureType === STRUCTURE_SPAWN) {
                        return 1;
                    }

                    if (
                        prioritizedExtensions.some(
                            (extensionDetail) =>
                                extensionDetail.pos.toRoomPos().x === structA.pos.x && extensionDetail.pos.toRoomPos().y === structA.pos.y
                        )
                    ) {
                        return -1;
                    }
                    if (
                        prioritizedExtensions.some(
                            (extensionDetail) =>
                                extensionDetail.pos.toRoomPos().x === structB.pos.x && extensionDetail.pos.toRoomPos().y === structB.pos.y
                        )
                    ) {
                        return 1;
                    }

                    return 0;
                }) as Array<StructureSpawn | StructureExtension>;
        }

        let result = spawn.spawnCreep(body, name, opts);

        if (result !== OK) {
            console.log(`Unexpected result from smartSpawn in spawn ${spawn.name}: ${result} - body: ${body} - opts: ${JSON.stringify(opts)}`);
        } else {
            spawn.room.memory.reservedEnergy != undefined
                ? (spawn.room.memory.reservedEnergy += partsArrayCost)
                : (spawn.room.memory.reservedEnergy = partsArrayCost);
            requestsToAdd.forEach((request) => {
                spawn.room.addRequest(request.resource, request.amount);
            });
            labTasksToAdd.forEach((task) => {
                spawn.room.addLabTask(task);
            });
        }

        return result;
    }

    static setLabTasksAndRequests(
        room: Room,
        name: string,
        body: BodyPartConstant[],
        labTasksToAdd: LabTaskPartial[],
        requestsToAdd: ResourceRequestPartial[],
        opts?: SpawnOptions
    ) {
        if (room.labs.length) {
            if (opts?.boosts?.length) {
                //get total requested boosts available by type
                let boostMap = room.getBoostsAvailable(opts.boosts);

                //calculate number of boosts needed
                opts.boosts.forEach((boostType) => {
                    let boostsAvailableInRoom = boostMap[boostType];
                    let boostsRequested = body.filter((p) => p === BODY_TO_BOOST_MAP[boostType]).length;

                    if (boostsAvailableInRoom < boostsRequested && room.terminal) {
                        //check other terminal rooms for available boost
                        const boostsNeeded = boostsRequested - boostsAvailableInRoom;
                        const boostsAvailableToImport = Math.floor(getResourceAvailability(BOOST_RESOURCE_MAP[boostType], room.name) / 30);
                        const boostsToImport = Math.min(boostsNeeded, boostsAvailableToImport);
                        if (boostsAvailableToImport > boostsRequested - boostsAvailableInRoom) {
                            const requestMetadata: ResourceRequestPartial = {
                                resource: BOOST_RESOURCE_MAP[boostType],
                                amount: boostsToImport * 30,
                                room: room.name,
                            };
                            requestsToAdd.push(requestMetadata);
                        }
                        boostsAvailableInRoom += boostsToImport;
                    }

                    labTasksToAdd.push({
                        type: LabTaskType.BOOST,
                        needs: [
                            {
                                resource: BOOST_RESOURCE_MAP[boostType] as ResourceConstant,
                                amount: Math.min(boostsRequested, boostsAvailableInRoom) * 30,
                            },
                        ],
                        targetCreepName: name,
                    });
                });

                if (labTasksToAdd.length) {
                    opts.memory.needsBoosted = true;
                }
            }
        }
    }

    static spawnManager(spawn: StructureSpawn): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.MANAGER,
                currentTaskPriority: Priority.HIGH,
            },
        };

        let immobile = false;

        let levelCap = 8;
        if (spawn.room.memory?.layout === RoomLayout.BUNKER) {
            let anchorPoint = spawn.room.memory.anchorPoint.toRoomPos();

            if (spawn.pos.x - anchorPoint.x === 0) {
                options.directions = [BOTTOM];
            } else if (spawn.pos.x - anchorPoint.x === -1) {
                options.directions = [BOTTOM_RIGHT];
            }

            immobile = true;
        } else if (spawn.room.memory?.layout === RoomLayout.STAMP) {
            const newManager = this.getNewStampManager(spawn.room);
            if (newManager) {
                options.memory.destination = newManager.pos;
                // Center Managers (and before terminal stage) don't need as many carry parts
                if (newManager.type !== 'rm' || spawn.room.controller.level < 6) {
                    levelCap = 2;
                }
                // Use immobile only after center finished building to avoid spot being taken
                if (newManager.type !== 'rm' && spawn.room.controller.level > 4 && spawn.pos.isNearTo(newManager.pos.toRoomPos())) {
                    options.directions = [spawn.pos.getDirectionTo(newManager.pos.toRoomPos())];
                    immobile = true;
                }
            }
        }

        if (immobile) {
            return spawn.spawnMax([CARRY, CARRY], this.generateName(options.memory.role, spawn.name), options, levelCap);
        } else {
            let body = this.createPartsArray([CARRY, CARRY], spawn.room.energyCapacityAvailable - 50, levelCap).concat([MOVE]);
            return spawn.smartSpawn(body, this.generateName(options.memory.role, spawn.name), options);
        }
    }

    static getNewStampManager(room: Room) {
        const currentManagers = room.creeps.filter((creep) => creep.memory.role === Role.MANAGER).map((manager) => manager.memory.destination);
        return room.memory.stampLayout.managers.find(
            (managerDetail) => managerDetail.rcl <= room.controller.level && !currentManagers.some((positions) => managerDetail.pos === positions)
        );
    }

    static needsManager(room: Room): boolean {
        let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
        let manager = roomCreeps.filter((creep) => creep.memory.role === Role.MANAGER);
        if (room.memory.layout === RoomLayout.STAMP) {
            return room.memory.stampLayout.managers.filter((managerDetail) => managerDetail.rcl <= room.controller.level)?.length > manager?.length;
        }
        return room.controller?.level >= 5 && (room.memory.layout !== undefined || !!room.memory.managerPos) && !manager?.length;
    }

    static hasProtector(roomName: string): boolean {
        return (
            Object.values(Game.creeps).some(
                (creep) => creep.memory.role === Role.PROTECTOR && (creep.memory.assignment === roomName || creep.pos.roomName === roomName)
            ) ||
            Memory.spawnAssignments.some((creep) => creep.spawnOpts.memory.role === Role.PROTECTOR && creep.spawnOpts.memory.assignment === roomName)
        );
    }

    static currentNumRampartProtectors(roomName: string): number {
        return (
            Object.values(Game.creeps).filter((creep) => creep.memory.role === Role.RAMPART_PROTECTOR && creep.pos.roomName === roomName).length +
            Memory.spawnAssignments.filter(
                (creep) => creep.spawnOpts.memory.role === Role.RAMPART_PROTECTOR && creep.spawnOpts.memory.room === roomName
            ).length
        );
    }

    static needsTransporter(room: Room) {
        let transporter = Object.values(Game.creeps).find((c) => c.memory.role === Role.TRANSPORTER && c.memory.room === room.name);
        let bigDroppedResources = room.find(FIND_DROPPED_RESOURCES).filter((res) => res.resourceType === RESOURCE_ENERGY && res.amount > 1000);
        let bigRuins = room.find(FIND_RUINS, { filter: (ruin) => ruin.store.getUsedCapacity() > 10000 });
        return !transporter && !!room.storage && bigDroppedResources.length + bigRuins.length > 1;
    }

    static needsMineralMiner(room: Room) {
        if (!room.memory.mineralMiningAssignments) {
            room.memory.mineralMiningAssignments = {};
        }

        if (room.storage?.store.getFreeCapacity() < 100000 || room.storage?.store[room.mineral.mineralType] > 100000) {
            return false;
        }

        let mineralMiningAssignments = room.memory.mineralMiningAssignments;
        return Object.keys(mineralMiningAssignments).some(
            (k) =>
                mineralMiningAssignments[k] === AssignmentStatus.UNASSIGNED &&
                (Game.rooms[k.toRoomPos()?.roomName]
                    ? k
                          .toRoomPos()
                          .findInRange(FIND_STRUCTURES, 1)
                          .filter((struct) => struct.structureType === STRUCTURE_EXTRACTOR && struct.isActive()).length &&
                      Game.rooms[k.toRoomPos()?.roomName].mineral.mineralAmount > 0
                    : true)
        );
    }

    static spawnMineralMiner(spawn: StructureSpawn): ScreepsReturnCode {
        let nextAvailableAssignment = Object.keys(spawn.room.memory.mineralMiningAssignments).find(
            (k) => spawn.room.memory.mineralMiningAssignments[k] === AssignmentStatus.UNASSIGNED
        );

        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.MINERAL_MINER,
                currentTaskPriority: Priority.HIGH,
                assignment: nextAvailableAssignment,
            },
        };

        let name = this.generateName(options.memory.role, spawn.name);
        let result = spawn.spawnMax([WORK, WORK, MOVE], name, options);
        if (result === OK) {
            spawn.room.memory.mineralMiningAssignments[nextAvailableAssignment] = name;
        }
        return result;
    }

    static findRemoteMineralMinerNeed(room: Room) {
        return false;
        if (room.storage?.store.getFreeCapacity() < 100000 || room.storage?.store[room.mineral.mineralType] > 100000) {
            return false;
        }

        return room.remoteMiningRooms.find(
            (remoteRoom) =>
                Memory.roomData[remoteRoom].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                Memory.remoteData[remoteRoom].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                Memory.remoteData[remoteRoom].reservationState !== RemoteRoomReservationStatus.ENEMY &&
                Memory.remoteData[remoteRoom].mineralAvailableAt <= Game.time &&
                Memory.remoteData[remoteRoom].mineralMiner === AssignmentStatus.UNASSIGNED
        );
    }

    static spawnRemoteMineralMiner(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        const options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.REMOTE_MINERAL_MINER,
                currentTaskPriority: Priority.HIGH,
                assignment: remoteRoomName,
            },
        };

        const name = this.generateName(options.memory.role, spawn.name);
        const result = spawn.spawnMax([WORK, WORK, CARRY, MOVE, MOVE], name, options);
        if (result === OK) {
            Memory.remoteData[remoteRoomName].mineralMiner = name;
        }
        return result;
    }

    static findExterminatorNeed(room: Room): string {
        return room.remoteSources
            .find(
                (source) =>
                    Memory.roomData[source.split('.')[2]].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
                    Memory.remoteData[source.split('.')[2]].threatLevel !== RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
                    Memory.remoteData[source.split('.')[2]].keeperExterminator === AssignmentStatus.UNASSIGNED &&
                    roadIsSafe(`${getStoragePos(room).toMemSafe()}:${Memory.rooms[room.name].remoteSources[source].miningPos}`)
            )
            ?.split('.')[2];
    }

    static spawnKeeperExterminator(spawn: StructureSpawn, remoteRoomName: string): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                assignment: remoteRoomName,
                room: spawn.room.name,
                role: Role.KEEPER_EXTERMINATOR,
            },
            disableSort: true,
        };

        let body = [
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            MOVE,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            ATTACK,
            HEAL,
            HEAL,
            HEAL,
            HEAL,
            HEAL,
            HEAL,
        ];

        let name = this.generateName(options.memory.role, spawn.name);
        let result = spawn.smartSpawn(body, name, options);

        if (result === OK) {
            Memory.remoteData[remoteRoomName].keeperExterminator = name;
        }

        return result;
    }

    static calculateRemoteMinerWorkNeeded(miningPos: string) {
        let energyPotential = isKeeperRoom(miningPos.toRoomPos().roomName) || isCenterRoom(miningPos.toRoomPos().roomName) ? 4000 : 3000;
        let workNeeded = energyPotential / (HARVEST_POWER * 300);

        return 1 + (workNeeded > 5 ? 7 : 5);
    }
}
