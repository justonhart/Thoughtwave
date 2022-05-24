import { posFromMem } from './memoryManagement';
import { PopulationManagement } from './populationManagement';
import { driveRemoteRoom } from './remoteRoomManagement';
import {
    createDropMiningSites,
    findBunkerLocation,
    placeBunkerOuterRamparts,
    placeBunkerConstructionSites,
    placeMinerLinks,
    placeRoadsToPOIs,
} from './roomDesign';

const BUILD_CHECK_PERIOD = 100;
const REPAIR_QUEUE_REFRESH_PERIOD = 500;

export function driveRoom(room: Room) {
    if (room.memory?.unclaim) {
        delete Memory.rooms[room.name];
        return;
    }

    // if room doesn't have memory, init room memory at appropriate stage
    if (room.memory?.phase === undefined) {
        initRoom(room);
    }

    if (!room.canSpawn()) {
        // fail state - if a room has unexpectedly lost all spawns
        if (!Memory.empire.operations.find((op) => op.targetRoom === room.name && op.type === OperationType.COLONIZE)) {
        }
    } else {
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
        if (PopulationManagement.needsProtector(homeRoom.name)) {
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
    runPhaseOneSpawnLogic(room);

    if (
        Game.time % BUILD_CHECK_PERIOD === 0 &&
        Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES &&
        room.find(FIND_MY_CONSTRUCTION_SITES).length < 25
    ) {
        if (room.memory.layout !== undefined) {
            if (room.controller.level >= 2) {
                placeRoadsToPOIs(room);
                placeBunkerConstructionSites(room);
            }
        }

        switch (room.memory.phaseShift) {
            case PhaseShiftStatus.PREPARE:
                if (dropMiningContainersConstructed(room) && room.storage?.store[RESOURCE_ENERGY] >= calculatePhaseShiftMinimum(room)) {
                    executePhaseShift(room);
                } else if (!dropMiningContainersInProgress(room)) {
                    createDropMiningSites(room);
                }
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
}

function runPhaseTwo(room: Room) {
    if (room.controller.level < 4) {
        downgradeRoomPhase(room);
        return;
    }

    if (room.memory.repairSearchCooldown > 0) {
        room.memory.repairSearchCooldown--;
    }

    if (Game.time % REPAIR_QUEUE_REFRESH_PERIOD === 0) {
        room.memory.repairQueue = findRepairTargets(room);
    }

    runPhaseTwoSpawnLogic(room);

    if (
        Game.time % BUILD_CHECK_PERIOD === 0 &&
        Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES &&
        room.find(FIND_MY_CONSTRUCTION_SITES).length < 25
    ) {
        if (room.memory.layout !== undefined) {
            placeRoadsToPOIs(room);
            placeBunkerConstructionSites(room);
            placeBunkerOuterRamparts(room);
        }

        if (room.managerLink) {
            placeMinerLinks(room);
        }
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

function executePhaseShift(room: Room) {
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
            creep.memory.role = Role.MAINTAINTER;
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

function downgradeRoomPhase(room: Room) {
    Memory.rooms[room.name] = {};
    initRoom(room);
}

function dropMiningContainersInProgress(room: Room): boolean {
    let positionsToCheck = room.memory.containerPositions.map((posString) => posFromMem(posString));

    let allSitesInProgress = positionsToCheck.every(
        (pos) =>
            pos.lookFor(LOOK_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_CONTAINER).length === 1 ||
            pos.lookFor(LOOK_CONSTRUCTION_SITES).filter((site) => site.structureType === STRUCTURE_CONTAINER).length === 1
    );

    return allSitesInProgress;
}

export function dropMiningContainersConstructed(room: Room): boolean {
    let positionsToCheck = room.memory.containerPositions.map((posString) => posFromMem(posString));

    let allContainersConstructed = positionsToCheck.every(
        (pos) => pos.lookFor(LOOK_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_CONTAINER).length === 1
    );

    return allContainersConstructed;
}
