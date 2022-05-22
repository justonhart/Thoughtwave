import { posFromMem } from './memoryManagement';
import { PopulationManagement } from './populationManagement';
import { driveRemoteRoom } from './remoteRoomManagement';
import { findBunkerLocation, getStructureForPos, placeBunkerOuterRamparts, placeMinerLinks, placeRoadsToPOIs } from './roomDesign';

export function driveRoom(room: Room) {
    if (room.memory?.unclaim) {
        delete Memory.rooms[room.name];
        return;
    }

    if (room.memory?.phase == undefined) {
        initRoom(room);
    }

    if (
        Game.time % 100 === 0 &&
        room.canSpawn() &&
        Object.keys(Game.constructionSites).length < 100 &&
        room.find(FIND_MY_CONSTRUCTION_SITES).length < 25
    ) {
        if (room.memory.layout !== undefined) {
            if (room.controller.level >= 2) {
                placeRoadsToPOIs(room);
                placeConstructionSites(room);
            }

            if (room.memory.phase > 1) {
                placeBunkerOuterRamparts(room);
            }
        }

        if (room.controller.level >= 5 && room.managerLink) {
            placeMinerLinks(room);
        }
    }

    room.memory.reservedEnergy = 0;

    switch (room.memory.phase) {
        case 1:
            runPhaseOne(room);
            break;
        case 2:
            runPhaseTwo(room);
            break;
    }

    runTowers(room);
    runHomeSecurity(room);
    driveRemoteRoom(room);

    if (room.memory.gates?.length) {
        runGates(room);
    }

    delete room.memory.reservedEnergy;
}

function runTowers(room: Room) {
    // @ts-ignore
    let towers: StructureTower[] = room.find(FIND_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_TOWER);

    let hostileCreeps = room.find(FIND_HOSTILE_CREEPS);

    let healers = hostileCreeps.filter((creep) => creep.getActiveBodyparts(HEAL) > 0);

    healers.length
        ? towers.forEach((tower) => tower.attack(tower.pos.findClosestByRange(healers)))
        : towers.forEach((tower) => tower.attack(tower.pos.findClosestByRange(hostileCreeps)));
}

function runHomeSecurity(homeRoom: Room) {
    const hostileCreeps = homeRoom.find(FIND_HOSTILE_CREEPS);

    if (hostileCreeps.length >= 2) {
        // TODO: add rampart defenders instead if ramparts are present in homeroom
        if (PopulationManagement.needsProtector(homeRoom)) {
            const body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], homeRoom.energyCapacityAvailable - 250);
            body.push(HEAL);
            Memory.empire.spawnAssignments.push({
                designee: homeRoom.name,
                body: body,
                memoryOptions: {
                    role: Role.PROTECTOR,
                    room: homeRoom.name,
                    assignment: homeRoom.name,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { healing: false },
                },
            });
        }
    }
}

function initRoom(room: Room) {
    room.memory.availableSourceAccessPoints = Array.from(
        new Set(
            [].concat(
                ...room
                    .find(FIND_SOURCES) //
                    .map((source) =>
                        room
                            .lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
                            .filter((terrain) => terrain.terrain != 'wall')
                            .map((terrain) => new RoomPosition(terrain.x, terrain.y, room.name).toMemSafe())
                    )
            )
        )
    );

    room.memory.sourceAccessPointCount = room.memory.availableSourceAccessPoints.length;
    room.memory.phase = 1;
    room.memory.gates = [];

    //calculate room layout here
    let anchorPoint = findBunkerLocation(room);

    if (anchorPoint) {
        room.memory.layout = RoomLayout.BUNKER;
        room.memory.anchorPoint = anchorPoint.toMemSafe();
        room.createConstructionSite(anchorPoint.x, anchorPoint.y - 1, STRUCTURE_SPAWN);
    }
}

function runPhaseOne(room: Room) {
    if (room.canSpawn()) {
        runPhaseOneSpawnLogic(room);
    }

    switch (room.memory.phaseShift) {
        case PhaseShiftStatus.PREPARE:
            if (dropMiningContainersConstructed(room) && room.storage?.store[RESOURCE_ENERGY] >= calculatePhaseShiftMinimum(room)) {
                room.memory.phaseShift = PhaseShiftStatus.EXECUTE;
            }
            break;
        case PhaseShiftStatus.EXECUTE:
            executePhaseShift(room);
            break;
        default:
            if (room.storage?.my) {
                let creationResult = createDropMiningSites(room);
                if (creationResult === OK) {
                    room.memory.phaseShift = PhaseShiftStatus.PREPARE;
                }
            }
            break;
    }
}

function runPhaseTwo(room: Room) {
    if (room.memory.repairSearchCooldown > 0) {
        room.memory.repairSearchCooldown--;
    }

    if (Game.time % 500 === 0) {
        room.memory.repairQueue = findRepairTargets(room);
    }

    if (room.canSpawn()) {
        runPhaseTwoSpawnLogic(room);
    }
}

function runPhaseOneSpawnLogic(room: Room) {
    //@ts-expect-error
    let availableRoomSpawns: StructureSpawn[] = room
        .find(FIND_MY_STRUCTURES)
        .filter((structure) => structure.structureType === STRUCTURE_SPAWN && !structure.spawning);

    let assigments = Memory.empire.spawnAssignments.filter((assignment) => assignment.designee === room.name);
    assigments.forEach((assignment) => {
        let canSpawnAssignment = room.energyAvailable >= assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
        if (canSpawnAssignment) {
            let spawn = availableRoomSpawns.pop();
            spawn?.spawnAssignedCreep(assignment);
        }
    });

    availableRoomSpawns.forEach((spawn) => spawn.spawnEarlyWorker());
}

function runPhaseTwoSpawnLogic(room: Room) {
    //@ts-expect-error
    let availableRoomSpawns: StructureSpawn[] = room
        .find(FIND_MY_STRUCTURES)
        .filter((structure) => structure.structureType === STRUCTURE_SPAWN && !structure.spawning);

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
    let distributor = roomCreeps.find((creep) => creep.memory.role === Role.DISTRIBUTOR);
    let manager = roomCreeps.find((creep) => creep.memory.role === Role.MANAGER);

    if (distributor === undefined) {
        let spawn = availableRoomSpawns.pop();
        spawn?.spawnDistributor();
    } else if (distributor.ticksToLive < 50) {
        //reserve energy & spawn for distributor
        availableRoomSpawns.pop();
        room.memory.reservedEnergy += PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], room.energyCapacityAvailable, 10)
            .map((part) => BODYPART_COST[part])
            .reduce((sum, next) => sum + next);
    }

    if (PopulationManagement.needsMiner(room)) {
        let spawn = availableRoomSpawns.pop();
        spawn?.spawnMiner();
    }

    if (PopulationManagement.needsManager(room)) {
        if (room.memory.layout !== undefined) {
            let suitableSpawn = availableRoomSpawns.find((spawn) => spawn.pos.isNearTo(posFromMem(room.memory.anchorPoint)));
            if (suitableSpawn) {
                suitableSpawn.spawnManager();
                availableRoomSpawns = availableRoomSpawns.filter((spawn) => spawn !== suitableSpawn);
            }
        } else {
            let spawn = availableRoomSpawns.pop();
            spawn?.spawnManager();
        }
    }

    let assigments = Memory.empire.spawnAssignments.filter((assignment) => assignment.designee === room.name);
    assigments.forEach((assignment) => {
        let canSpawnAssignment = room.energyAvailable >= assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
        if (canSpawnAssignment) {
            let spawn = availableRoomSpawns.pop();
            spawn?.spawnAssignedCreep(assignment);
        }
        return; // wait till it can be spawned because stuff below this is not as important
    });

    if (PopulationManagement.needsRemoteMiner(room)) {
        let spawn = availableRoomSpawns.pop();
        spawn?.spawnRemoteMiner();
    }

    if (PopulationManagement.needsGatherer(room)) {
        let spawn = availableRoomSpawns.pop();
        spawn?.spawnGatherer();
    }

    if (PopulationManagement.needsReserver(room)) {
        let spawn = availableRoomSpawns.pop();
        spawn?.spawnReserver();
    }

    // TODO remove set room and put in function
    if (
        Game.time % 8000 === 0 &&
        !Memory.empire.spawnAssignments.filter((creep) => creep.memoryOptions.role === Role.SCOUT && creep.designee === room.name).length
    ) {
        Memory.empire.spawnAssignments.push({
            designee: room.name,
            body: [MOVE],
            memoryOptions: {
                role: Role.SCOUT,
                room: room.name,
            },
        });
    }

    availableRoomSpawns.forEach((spawn) => spawn.spawnPhaseTwoWorker());
}

export function createDropMiningSites(room: Room): OK | ERR_NOT_FOUND {
    let sources: Source[] = room.find(FIND_SOURCES);

    let containerPositions = new Set<RoomPosition>();
    sources.forEach((source) => {
        let possiblePositions = room
            .lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
            .filter((terrain) => terrain.terrain != 'wall')
            .map((terrain) => new RoomPosition(terrain.x, terrain.y, source.room.name));

        //check to see if containers already exist
        let positionsWithContainers = possiblePositions.filter(
            (pos) => pos.lookFor(LOOK_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_CONTAINER).length
        );
        if (positionsWithContainers.length) {
            possiblePositions = positionsWithContainers;
        }

        //set closest position to storage as container position
        let candidate = room.storage.pos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
        if (candidate) {
            containerPositions.add(candidate);
        }
    });

    if (containerPositions.size === sources.length) {
        room.memory.containerPositions = [];
        containerPositions.forEach((pos) => {
            room.memory.containerPositions.push(pos.toMemSafe());
            if (!pos.lookFor(LOOK_STRUCTURES).some((structure) => structure.structureType === STRUCTURE_CONTAINER)) {
                room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
            }
        });
        return OK;
    }

    return ERR_NOT_FOUND;
}

export function dropMiningContainersConstructed(room: Room): boolean {
    let positionsToCheck = room.memory.containerPositions.map((posString) => posFromMem(posString));

    let allContainersConstructed = positionsToCheck.every(
        (pos) => pos.lookFor(LOOK_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_CONTAINER).length === 1
    );

    return allContainersConstructed;
}

function calculatePhaseShiftMinimum(room: Room): number {
    const WORK_COST = 100;
    const CARRY_COST = 50;
    const MOVE_COST = 50;

    let dropMinerCost = WORK_COST * 5 + MOVE_COST * 3;

    let transportCreepPartCost = CARRY_COST * 2 + MOVE_COST;

    let transportCreepCost =
        Math.min(Math.floor(room.energyCapacityAvailable / transportCreepPartCost), 10 * transportCreepPartCost) * transportCreepPartCost;

    return 2 * (2 * transportCreepCost + room.find(FIND_SOURCES).length * dropMinerCost);
}

export function executePhaseShift(room: Room) {
    console.log(`Executing phase shift in ${room.name}`);

    //wipe creep memory in room to stop gathering
    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);

    roomCreeps.forEach((creep) => {
        delete creep.memory.gathering;
        delete creep.memory.currentTaskPriority;
        delete creep.memory.targetId;
        delete creep.memory.miningPos;

        //reassign EarlyWorkers to other roles
        if (creep.memory.role === Role.WORKER) {
            let upgraderCount = Object.values(Game.creeps).filter(
                (creep) => creep.memory.room === room.name && creep.memory.role === Role.UPGRADER
            ).length;
            let maintainerCount = Object.values(Game.creeps).filter(
                (creep) => creep.memory.room === room.name && creep.memory.role === Role.MAINTAINTER
            ).length;

            creep.memory.role = upgraderCount <= maintainerCount ? Role.UPGRADER : Role.MAINTAINTER;
        }
    });

    //create assignment tracker
    room.memory.miningAssignments = new Map();
    room.memory.remoteAssignments = {};
    room.memory.containerPositions.forEach((position) => {
        room.memory.miningAssignments[position] = AssignmentStatus.UNASSIGNED;
    });

    room.memory.repairQueue = [];
    room.memory.repairSearchCooldown = 0;

    //remove phase one memory values
    delete room.memory.availableSourceAccessPoints;
    delete room.memory.sourceAccessPointCount;
    delete room.memory.phaseShift;
    delete room.memory.containerPositions;

    room.memory.phase = 2;
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
                structure.structureType !== STRUCTURE_WALL && structure.structureType !== STRUCTURE_RAMPART && structure.hits < structure.hitsMax
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

export function placeConstructionSites(room: Room) {
    let referencePos = posFromMem(room.memory.anchorPoint);

    let placed = 0;
    for (let lookDistance = 1; lookDistance < 7 && placed < 5; lookDistance++) {
        let x: number, y: number;

        for (y = referencePos.y - lookDistance; y <= referencePos.y + lookDistance && placed < 5; y++) {
            for (x = referencePos.x - lookDistance; x <= referencePos.x + lookDistance && placed < 5; x++) {
                if (y > referencePos.y - lookDistance && y < referencePos.y + lookDistance && x > referencePos.x - lookDistance) {
                    x = referencePos.x + lookDistance;
                }

                let structureType = getStructureForPos(room.memory.layout, new RoomPosition(x, y, room.name), referencePos);
                let buildPosition = new RoomPosition(x, y, room.name);

                if (structureType !== STRUCTURE_ROAD) {
                    let addResult = room.createConstructionSite(buildPosition, structureType);
                    if (addResult == OK) {
                        placed++;
                    }
                } else {
                    //only place roads adjacent to structures
                    let adjacentStructures =
                        buildPosition
                            .findInRange(FIND_MY_CONSTRUCTION_SITES, 1)
                            .filter((s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART)
                            //@ts-expect-error
                            .concat(buildPosition.findInRange(FIND_MY_STRUCTURES, 1))
                            .filter((structure) => structure.structureType !== STRUCTURE_RAMPART).length > 0;
                    if (adjacentStructures) {
                        let addResult = room.createConstructionSite(buildPosition, structureType);
                        if (addResult == OK) {
                            placed++;
                        }
                    }
                }
            }
        }
    }
}

// core structures are structures contained within auto-generated layouts: Spawns, storage, nuker, terminal, factory, extensions, labs, towers, observer
export function roomNeedsCoreStructures(room: Room) {
    //combine structures and construction sites into one array for simple math
    //@ts-expect-error
    let roomStructures = room.find(FIND_MY_STRUCTURES).concat(room.find(FIND_MY_CONSTRUCTION_SITES));
    let spawnCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_SPAWN).length;
    let extensionCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_EXTENSION).length;
    let storage = roomStructures.filter((structure) => structure.structureType === STRUCTURE_STORAGE).length;
    let nuker = roomStructures.filter((structure) => structure.structureType === STRUCTURE_NUKER).length;
    let terminal = roomStructures.filter((structure) => structure.structureType === STRUCTURE_TERMINAL).length;
    let factory = roomStructures.filter((structure) => structure.structureType === STRUCTURE_FACTORY).length;
    let labCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_LAB).length;
    let towerCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_TOWER).length;
    let managerLink =
        posFromMem(room.memory.anchorPoint)
            .findInRange(FIND_MY_STRUCTURES, 1)
            .filter((s) => s.structureType === STRUCTURE_LINK).length +
            posFromMem(room.memory.anchorPoint)
                .findInRange(FIND_MY_CONSTRUCTION_SITES, 1)
                .filter((s) => s.structureType === STRUCTURE_LINK).length >=
        1;
    let observer = roomStructures.filter((structure) => structure.structureType === STRUCTURE_OBSERVER).length;
    let pSpawn = roomStructures.filter((structure) => structure.structureType === STRUCTURE_POWER_SPAWN).length;

    switch (room.controller.level) {
        case 1:
            return spawnCount < 1;
        case 2:
            return spawnCount < 1 || extensionCount < 5;
        case 3:
            return spawnCount < 1 || extensionCount < 10 || towerCount < 1;
        case 4:
            return spawnCount < 1 || extensionCount < 20 || towerCount < 1 || storage < 1;
        case 5:
            return spawnCount < 1 || extensionCount < 30 || towerCount < 2 || storage < 1 || !managerLink;
        case 6:
            return spawnCount < 1 || extensionCount < 40 || towerCount < 2 || storage < 1 || !managerLink || labCount < 3 || terminal < 1;
        case 7:
            return (
                spawnCount < 2 || extensionCount < 50 || towerCount < 3 || storage < 1 || !managerLink || labCount < 6 || terminal < 1 || factory < 1
            );
        case 8:
            return (
                spawnCount < 3 ||
                extensionCount < 60 ||
                towerCount < 6 ||
                storage < 1 ||
                !managerLink ||
                labCount < 10 ||
                terminal < 1 ||
                factory < 1 ||
                nuker < 1 ||
                pSpawn < 1 ||
                observer < 1
            );
        default:
            return false;
    }
}
