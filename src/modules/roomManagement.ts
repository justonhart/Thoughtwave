import { CombatIntel } from './combatIntel';
import { runLabs } from './labManagement';
import { posFromMem } from './data';
import { PopulationManagement } from './populationManagement';
import { manageRemoteRoom } from './remoteRoomManagement';
import {
    findBunkerLocation,
    placeBunkerOuterRamparts,
    placeBunkerConstructionSites,
    placeMinerLinks,
    placeRoadsToPOIs,
    cleanRoom,
    placeBunkerInnerRamparts,
    roomNeedsCoreStructures,
    placeUpgraderLink,
} from './roomDesign';

const BUILD_CHECK_PERIOD = 100;
const REPAIR_QUEUE_REFRESH_PERIOD = 500;

export function driveRoom(room: Room) {
    if (room.memory?.unclaim) {
        delete Memory.rooms[room.name];
        return;
    }

    // if room doesn't have memory, init room memory at appropriate stage
    if (!Memory.rooms[room.name].gates) {
        initRoom(room);
    }

    if (!room.canSpawn()) {
        // fail state - if a room has unexpectedly lost all spawns
        if (!Memory.operations.find((op) => op.targetRoom === room.name && op.type === OperationType.COLONIZE)) {
        }
    } else {
        room.memory.reservedEnergy = 0;

        let nukes = room.find(FIND_NUKES);
        if (room.controller.level >= 6 && nukes.length && getStructuresToProtect(nukes)?.length) {
            let structuresAtRisk = getStructuresToProtect(nukes);
            structuresAtRisk.forEach((structureId) => {
                let structure = Game.getObjectById(structureId);
                room.visual.circle(structure.pos, { opacity: 1, strokeWidth: 0.8, stroke: '#f44336' });
                if (structure && !structure?.getRampart()) {
                    let constructionSite = structure?.pos.lookFor(LOOK_CONSTRUCTION_SITES).pop();
                    if (constructionSite?.structureType !== STRUCTURE_RAMPART) {
                        constructionSite?.remove();
                        structure.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            });
        } else {
            if (room.memory.repairSearchCooldown > 0) {
                room.memory.repairSearchCooldown--;
            }

            if (Game.time % REPAIR_QUEUE_REFRESH_PERIOD === 0) {
                room.memory.repairQueue = findRepairTargets(room);
                room.memory.needsWallRepair =
                    room.find(FIND_STRUCTURES, {
                        filter: (s) =>
                            (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < room.getDefenseHitpointTarget(),
                    }).length > 0;
            }

            if (room.memory.repairQueue.length) {
                room.memory.repairQueue.forEach((job) => {
                    let pos = Game.getObjectById(job)?.pos;
                    room.visual.text('🛠', pos);
                });
            }

            if (
                Game.cpu.bucket > 200 &&
                !global.roomConstructionsChecked &&
                (room.memory.dontCheckConstructionsBefore ?? 0) < Game.time &&
                (room.energyStatus >= EnergyStatus.RECOVERING || room.energyStatus === undefined) &&
                Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES &&
                room.find(FIND_MY_CONSTRUCTION_SITES).length < 15
            ) {
                switch (room.controller.level) {
                    case 8:
                    case 7:
                        placeUpgraderLink(room);
                    case 6:
                        if (!roomNeedsCoreStructures(room)) {
                            placeBunkerInnerRamparts(room);
                        }
                        placeExtractor(room);
                        placeMineralContainers(room);
                    case 5:
                        placeMinerLinks(room);
                    case 4:
                        if (!roomNeedsCoreStructures(room)) {
                            placeBunkerOuterRamparts(room);
                            placeMiningRamparts(room);
                        }
                    case 3:
                        placeMiningPositionContainers(room);
                    case 2:
                        placeBunkerConstructionSites(room);
                        placeRoadsToPOIs(room);
                    case 1:
                        cleanRoom(room);
                }
                global.roomConstructionsChecked = true;
                room.memory.dontCheckConstructionsBefore = Game.time + BUILD_CHECK_PERIOD;
            }
        }

        const isHomeUnderAttack = runHomeSecurity(room);
        runTowers(room, isHomeUnderAttack);

        if (room.memory.anchorPoint) {
            let anchorPoint = posFromMem(room.memory.anchorPoint);
            if (
                anchorPoint
                    .findInRange(FIND_HOSTILE_CREEPS, 6)
                    .some(
                        (creep) =>
                            creep.owner.username !== 'Invader' &&
                            (creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK))
                    )
            ) {
                room.controller.activateSafeMode();
            }
        }

        if (room.memory.gates?.length) {
            runGates(room);
        }

        try {
            runSpawning(room);
        } catch (e) {
            console.log(`Error caught running room ${room.name} for Spawning: \n${e}`);
        }

        try {
            runLabs(room);
        } catch (e) {
            console.log(`Error caught running room ${room.name} for Labs: \n${e}`);
        }

        if (!isHomeUnderAttack && room.name !== 'W23S54') {
            runRemoteRooms(room);
        }

        delete room.memory.reservedEnergy;
    }
}

function runTowers(room: Room, isRoomUnderAttack: boolean) {
    const towers = room.find(FIND_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_TOWER) as StructureTower[];

    const myHurtCreeps = room
        .find(FIND_MY_CREEPS)
        .filter(
            (creep) =>
                creep.hits < creep.hitsMax &&
                (!isRoomUnderAttack ||
                    creep.memory.role === Role.RAMPART_PROTECTOR ||
                    creep.memory.role === Role.DISTRIBUTOR ||
                    creep.memory.role === Role.WORKER)
        );
    if (myHurtCreeps.length) {
        var mostHurtCreep = myHurtCreeps.reduce((mostHurt, nextCreep) => (mostHurt.hits < nextCreep.hits ? mostHurt : nextCreep));
    }
    if (mostHurtCreep) {
        towers.forEach((tower) => tower.heal(mostHurtCreep));
        return;
    }

    if (!room.controller.safeMode) {
        const focus = Object.values(Game.creeps).find((creep) => creep.room.name === room.name && creep.memory.targetId2 && creep.memory.ready >= 5);
        if (focus) {
            towers.forEach((tower) => tower.attack(Game.getObjectById(focus.memory.targetId2)));
        } else {
            // Towers do not attack creeps on the edge because this can cause them to simply waste energy if two attackers are in the room and the healers go in and out of the room
            const hostileCreep = room
                .find(FIND_HOSTILE_CREEPS)
                .filter((creep) => creep.owner.username === 'Invader' || (creep.pos.x > 1 && creep.pos.y < 48 && creep.pos.y > 1 && creep.pos.x < 48))
                .find((creep) => {
                    const hostileCreepInfo = CombatIntel.getCreepCombatData(room, true, creep.pos);
                    const myCreepInfo = CombatIntel.getCreepCombatData(room, false, creep.pos);
                    const myTowerInfo = CombatIntel.getTowerCombatData(room, false, creep.pos);
                    return (
                        CombatIntel.getPredictedDamage(
                            myTowerInfo.dmgAtPos + myCreepInfo.totalDmg,
                            hostileCreepInfo.highestDmgMultiplier,
                            hostileCreepInfo.highestToughHits
                        ) > hostileCreepInfo.totalHeal && !Memory.playersToIgnore?.includes(creep.owner.username)
                    );
                });
            if (hostileCreep) {
                towers.forEach((tower) => tower.attack(hostileCreep));
            }
        }
    }
}

function runHomeSecurity(homeRoom: Room): boolean {
    const towerData = CombatIntel.getTowerCombatData(homeRoom, false);
    const hostileCreepData = CombatIntel.getCreepCombatData(homeRoom, true);

    if (hostileCreepData.totalHeal < towerData.minDmg * hostileCreepData.highestDmgMultiplier) {
        return false; // Towers can handle it for sure
    }

    if (
        homeRoom.memory.layout === RoomLayout.BUNKER &&
        hostileCreepData.totalHeal < CombatIntel.towerDamageAtRange(towerData, 12) * hostileCreepData.highestDmgMultiplier
    ) {
        return false; // Closest Creeps in BunkerLayout have to be in a range of 12 if they want to hit the ramparts in any way
    }

    // No Towers yet so spawn a protector with heal which can then kite the invader around
    if (hostileCreepData.creeps.length && homeRoom.controller.level === 2) {
        const currentNumProtectors = PopulationManagement.currentNumRampartProtectors(homeRoom.name);
        if (!currentNumProtectors) {
            Memory.spawnAssignments.push({
                designee: homeRoom.name,
                body: [RANGED_ATTACK, MOVE, MOVE, HEAL],
                spawnOpts: {
                    memory: {
                        role: Role.RAMPART_PROTECTOR,
                        room: homeRoom.name,
                        currentTaskPriority: Priority.MEDIUM,
                        combat: { flee: false },
                    },
                },
            });
        }
        return false;
    }

    let minNumHostileCreeps = homeRoom.controller.level < 4 ? 1 : 2;

    if (hostileCreepData.creeps.length >= minNumHostileCreeps) {
        // Spawn multiple rampartProtectors based on the number of enemy hostiles
        const currentNumProtectors = PopulationManagement.currentNumRampartProtectors(homeRoom.name);
        let t = hostileCreepData.creeps.length > 12 ? 1 : -1;
        if (
            !currentNumProtectors ||
            (hostileCreepData.creeps.length >= 4 && currentNumProtectors + t - Math.floor(hostileCreepData.creeps.length / 4) < 0)
        ) {
            console.log(`Enemy Squad in homeRoom ${homeRoom.name}`);
            // Against squads we need two units (ranged for spread out dmg and melee for single target damage)
            const attackerBody = PopulationManagement.createPartsArray([ATTACK, ATTACK, ATTACK, ATTACK, MOVE], homeRoom.energyCapacityAvailable, 10);
            Memory.spawnAssignments.push({
                designee: homeRoom.name,
                body: attackerBody,
                spawnOpts: {
                    boosts: [BoostType.ATTACK],
                    memory: {
                        role: Role.RAMPART_PROTECTOR,
                        room: homeRoom.name,
                        assignment: homeRoom.name,
                        currentTaskPriority: Priority.HIGH,
                        combat: { flee: false },
                    },
                },
            });
        }
        return true;
    }
    return false;
}

export function initRoom(room: Room) {
    let miningPostitions = findMiningPostitions(room);

    if (!miningPostitions) {
        return;
    }

    Memory.rooms[room.name] = {
        gates: [],
        repairSearchCooldown: 0,
        repairQueue: [],
        miningAssignments: {},
        mineralMiningAssignments: {},
        remoteMiningRooms: [],
    };

    miningPostitions.forEach((pos) => {
        room.memory.miningAssignments[pos.toMemSafe()] = AssignmentStatus.UNASSIGNED;
    });

    let mineralMiningPosition = findMineralMiningPosition(room);
    room.memory.mineralMiningAssignments[mineralMiningPosition.toMemSafe()] = AssignmentStatus.UNASSIGNED;

    //calculate room layout here
    let anchorPoint = findBunkerLocation(room);

    if (anchorPoint) {
        room.memory.layout = RoomLayout.BUNKER;
        room.memory.anchorPoint = anchorPoint.toMemSafe();
        room.createConstructionSite(anchorPoint.x, anchorPoint.y - 1, STRUCTURE_SPAWN);
    }
}

function findMiningPostitions(room: Room) {
    let sources = room.find(FIND_SOURCES);
    let miningPositions = new Set<RoomPosition>();
    sources.forEach((source) => {
        let possiblePositions = room
            .lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
            .filter((terrain) => terrain.terrain != 'wall')
            .map((terrain) => new RoomPosition(terrain.x, terrain.y, source.room.name));

        //set closest position to storage as container position
        let anchorPoint = posFromMem(room.memory.anchorPoint);
        let referencePos = anchorPoint ? new RoomPosition(anchorPoint.x + 1, anchorPoint.y - 1, room.name) : room.controller.pos;
        let candidate = referencePos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
        if (candidate) {
            miningPositions.add(candidate);
        }
    });

    // if a unique mining position was found for each source
    if (miningPositions.size === sources.length) {
        return Array.from(miningPositions);
    }

    return undefined;
}

function findMineralMiningPosition(room: Room): RoomPosition {
    let possiblePositions = room
        .lookForAtArea(LOOK_TERRAIN, room.mineral.pos.y - 1, room.mineral.pos.x - 1, room.mineral.pos.y + 1, room.mineral.pos.x + 1, true)
        .filter((terrain) => terrain.terrain != 'wall')
        .map((terrain) => new RoomPosition(terrain.x, terrain.y, room.mineral.room.name));

    //set closest position to storage as container position
    let anchorPoint = posFromMem(room.memory.anchorPoint);
    let referencePos = anchorPoint ? new RoomPosition(anchorPoint.x + 1, anchorPoint.y - 1, room.name) : room.controller.pos;
    let candidate = referencePos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
    if (candidate) {
        return candidate;
    }
}

function runSpawning(room: Room) {
    let spawns = Object.values(Game.spawns).filter((spawn) => spawn.room === room);

    let busySpawns = spawns.filter((spawn) => spawn.spawning);

    busySpawns.forEach((spawn) => {
        if (spawn.spawning.remainingTime <= 0) {
            let blockingCreeps = spawn.pos
                .findInRange(FIND_MY_CREEPS, 1)
                .filter(
                    (creep) => creep.memory.role !== Role.MANAGER && (!creep.memory.targetId || creep.memory.currentTaskPriority <= Priority.HIGH)
                );
            blockingCreeps.forEach((blocker) => {
                blocker.travelTo(spawn, { flee: true, range: 2 });
            });
        }
    });

    let availableSpawns = spawns.filter((spawn) => !spawn.spawning);

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
    let distributor = roomCreeps.find((creep) => creep.memory.role === Role.DISTRIBUTOR);
    let workerCount = roomCreeps.filter((creep) => creep.memory.role === Role.WORKER || creep.memory.role === Role.UPGRADER).length;
    let assignments = Memory.spawnAssignments.filter((assignment) => assignment.designee === room.name);
    let roomContainsViolentHostiles =
        room.find(FIND_HOSTILE_CREEPS).filter((creep) => creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK)).length > 0 &&
        !room.controller.safeMode;

    if (distributor === undefined) {
        let spawn = availableSpawns.pop();
        spawn?.spawnDistributor();
    } else if (distributor.ticksToLive < 100) {
        //reserve energy & spawn for distributor
        availableSpawns.pop();
        room.memory.reservedEnergy += PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], room.energyCapacityAvailable, 10)
            .map((part) => BODYPART_COST[part])
            .reduce((sum, next) => sum + next);
    }

    if (roomContainsViolentHostiles) {
        let protectorAssignments = assignments.filter(
            (assignment) =>
                assignment.spawnOpts.memory.room === room.name &&
                (assignment.spawnOpts.memory.role === Role.RAMPART_PROTECTOR || assignment.spawnOpts.memory.role === Role.PROTECTOR)
        );
        protectorAssignments.forEach((assignment) => {
            let canSpawnAssignment = room.energyAvailable >= assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
            if (canSpawnAssignment) {
                let spawn = availableSpawns.pop();
                spawn?.spawnAssignedCreep(assignment);
            }
        });
    }

    if (PopulationManagement.needsTransporter(room) && !roomContainsViolentHostiles) {
        let options: SpawnOptions = {
            memory: {
                room: room.name,
                role: Role.TRANSPORTER,
            },
        };
        let spawn = availableSpawns.pop();
        spawn?.spawnMax([CARRY, CARRY, MOVE], PopulationManagement.generateName(options.memory.role, spawn.name), options, 10);
    }

    if (PopulationManagement.needsMiner(room) && (!roomContainsViolentHostiles || room.memory.layout === undefined)) {
        let spawn = availableSpawns.pop();
        spawn?.spawnMiner();
    }

    if (PopulationManagement.needsManager(room)) {
        if (room.memory.layout !== undefined) {
            let suitableSpawn = availableSpawns.find((spawn) => spawn.pos.isNearTo(posFromMem(room.memory.anchorPoint)));
            if (suitableSpawn) {
                suitableSpawn.spawnManager();
                availableSpawns = availableSpawns.filter((spawn) => spawn !== suitableSpawn);
            }
        } else {
            let spawn = availableSpawns.pop();
            spawn?.spawnManager();
        }
    }

    if (PopulationManagement.needsMineralMiner(room)) {
        let spawn = availableSpawns.pop();
        spawn?.spawnMineralMiner();
    }

    if (workerCount >= room.workerCapacity && !roomContainsViolentHostiles) {
        assignments.forEach((assignment) => {
            let canSpawnAssignment = room.energyAvailable >= assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
            if (canSpawnAssignment) {
                let spawn = availableSpawns.pop();
                spawn?.spawnAssignedCreep(assignment);
            }
        });

        if (
            room.energyStatus >= EnergyStatus.RECOVERING &&
            room.memory.remoteMiningRooms?.length &&
            !roomContainsViolentHostiles &&
            room.name !== 'W23S54'
        ) {
            let exterminatorNeed = PopulationManagement.findExterminatorNeed(room);
            if (exterminatorNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnKeeperExterminator(exterminatorNeed);
            }

            let reserverNeed = PopulationManagement.findReserverNeed(room);
            if (reserverNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnReserver(reserverNeed);
            }

            let remoteMinerNeed = PopulationManagement.findRemoteMinerNeed(room);
            if (remoteMinerNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnRemoteMiner(remoteMinerNeed);
            }

            let gathererNeed = PopulationManagement.findGathererNeed(room);
            if (gathererNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnGatherer(gathererNeed);
            }

            const remoteMineralMinerNeed = PopulationManagement.findRemoteMineralMinerNeed(room);
            if (remoteMineralMinerNeed) {
                const spawn = availableSpawns.pop();
                spawn?.spawnRemoteMineralMiner(remoteMineralMinerNeed);
            }
        }
    }

    if (!roomContainsViolentHostiles || room.memory.layout === undefined) {
        availableSpawns.forEach((spawn) => spawn.spawnWorker());
    }
}

export function findRepairTargets(room: Room): Id<Structure>[] {
    if (!room.memory.repairQueue) {
        room.memory.repairQueue = [];
    }

    let repairTargetQueue: Id<Structure>[] = [];

    let damagedRoomStructures = room
        .find(FIND_STRUCTURES)
        .filter(
            (structure) =>
                structure.structureType !== STRUCTURE_WALL &&
                structure.structureType !== STRUCTURE_RAMPART &&
                structure.hits < (structure.structureType === STRUCTURE_ROAD ? structure.hitsMax * 0.9 : structure.hitsMax)
        );

    damagedRoomStructures.sort((structureA, structureB) => structureA.hits / structureA.hitsMax - structureB.hits / structureB.hitsMax);
    damagedRoomStructures.forEach((structure) => {
        repairTargetQueue.push(structure.id);
    });

    return repairTargetQueue;
}

function runGates(room: Room): void {
    let gates = room.memory.gates.filter((gate) => Game.getObjectById(gate.id));

    gates.forEach((gateId) => {
        if (gateId.lastToggled === undefined) {
            gateId.lastToggled = Game.time - 5;
        }

        let gate = Game.getObjectById(gateId.id);
        let creepsInRange = gate.pos.findInRange(FIND_HOSTILE_CREEPS, 1).length > 0;

        if (gate.isPublic && creepsInRange) {
            gate.setPublic(false);
            gateId.lastToggled = Game.time;
        } else if (!gate.isPublic && !creepsInRange && Game.time - gateId.lastToggled > 3) {
            gate.setPublic(true);
        }
    });

    room.memory.gates = gates;
}

function placeMiningPositionContainers(room: Room) {
    let miningPositions = Object.keys(room.memory.miningAssignments).map((pos) => posFromMem(pos));
    miningPositions.forEach((pos) => {
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
    });
}

function placeMiningRamparts(room: Room) {
    let miningPositions = Object.keys(room.memory.miningAssignments).map((pos) => posFromMem(pos));
    miningPositions.forEach((pos) => {
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_RAMPART);
    });
}

function placeMineralContainers(room: Room) {
    if (!room.memory.mineralMiningAssignments || !Object.keys(room.memory.mineralMiningAssignments).length) {
        room.memory.mineralMiningAssignments = {};
        let mineralMiningPos = findMineralMiningPosition(room);
        room.memory.mineralMiningAssignments[mineralMiningPos.toMemSafe()] = AssignmentStatus.UNASSIGNED;
    }

    let miningPositions = Object.keys(room.memory.mineralMiningAssignments).map((pos) => posFromMem(pos));
    miningPositions.forEach((pos) => {
        Game.rooms[pos.roomName]?.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
    });
}

function placeExtractor(room: Room) {
    let extractor = room.find(FIND_STRUCTURES).find((struct) => struct.structureType === STRUCTURE_EXTRACTOR);
    if (!extractor) {
        let mineralPos = room.mineral.pos;
        room.createConstructionSite(mineralPos, STRUCTURE_EXTRACTOR);
    }
}

export function getStructuresToProtect(nukes: Nuke[]) {
    let structuresToProtectWithHitAmounts = new Map<string, number>();

    nukes.forEach((nuke) => {
        let structuresAtRisk = nuke.room
            .lookForAtArea(LOOK_STRUCTURES, nuke.pos.y - 2, nuke.pos.x - 2, nuke.pos.y + 2, nuke.pos.x + 2, true)
            .filter((s) => s.structure.structureType !== STRUCTURE_ROAD && s.structure.structureType !== STRUCTURE_RAMPART);
        structuresAtRisk.forEach((look) => {
            structuresToProtectWithHitAmounts[look.structure.id]
                ? (structuresToProtectWithHitAmounts[look.structure.id] += look.structure.pos.isEqualTo(nuke.pos) ? 10000000 : 5000000)
                : (structuresToProtectWithHitAmounts[look.structure.id] = look.structure.pos.isEqualTo(nuke.pos) ? 10000000 : 5000000);
        });
    });

    let structureIds = Object.keys(structuresToProtectWithHitAmounts) as Id<Structure>[];
    let filteredStructuresToProtect = structureIds.filter(
        (structureId) =>
            !(
                Game.getObjectById(structureId)?.getRampart()?.hits >= structuresToProtectWithHitAmounts[structureId] ||
                Game.getObjectById(structureId)?.getRampart()?.hits === RAMPART_HITS_MAX[Game.getObjectById(structureId).room.controller.level]
            )
    );

    return filteredStructuresToProtect;
}

function runRemoteRooms(room: Room) {
    let remoteRooms = room.memory.remoteMiningRooms;
    remoteRooms?.forEach((remoteRoomName) => {
        try {
            manageRemoteRoom(room.name, remoteRoomName);
        } catch (e) {
            console.log(`Error caught running remote room ${remoteRoomName}: \n${e}`);
        }
    });
}
