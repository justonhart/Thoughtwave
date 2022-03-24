import { posFromMem } from './memoryManagement';

export function driveRoom(room: Room) {
    if (room.memory?.phase == undefined && room.memory?.sourceAccessPointCount) {
        room.memory.phase = 1;
    }
    if (room.memory?.phase == undefined) {
        initRoomMemory(room);
    }

    switch (room.memory.phase) {
        case 1:
            runPhaseOne(room);
            break;
        case 2:
            runPhaseTwo(room);
            break;
    }

    runTowers(room);
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

function initRoomMemory(room: Room) {
    room.memory.availableSourceAccessPoints = [].concat(
        ...Array.from(
            new Set(
                room
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
}

function runPhaseOne(room: Room) {
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

export function calculatePhaseShiftMinimum(room: Room): number {
    const WORK_COST = 100;
    const CARRY_COST = 50;
    const MOVE_COST = 50;

    let dropMinerCost = WORK_COST * 5 + MOVE_COST * 3;

    let transportCreepPartCost = CARRY_COST * 2 + MOVE_COST;

    let transportCreepCost = Math.floor(room.energyCapacityAvailable / transportCreepPartCost) * transportCreepPartCost;

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
        creep.memory._move = {};

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
    room.memory.containerPositions.forEach((position) => {
        room.memory.miningAssignments[position] = AssignmentStatus.UNASSIGNED;
    });

    //remove phase one memory values
    delete room.memory.availableSourceAccessPoints;
    delete room.memory.sourceAccessPointCount;
    delete room.memory.phaseShift;
    delete room.memory.containerPositions;

    room.memory.phase = 2;
}

function runPhaseTwo(room: Room) {}
