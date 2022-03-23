export default function driveRoom(room: Room) {
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
            if (dropMiningContainersConstructed() && room.storage?.store[RESOURCE_ENERGY] >= calculateMinimumEnergy()) {
                room.memory.phaseShift = PhaseShiftStatus.EXECUTE;
            }
            break;
        case PhaseShiftStatus.EXECUTE:
            executePhaseShift();
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

function createDropMiningSites(room: Room): OK | ERR_NOT_FOUND {
    let sources: Source[] = room.find(FIND_SOURCES);

    let containerPositions: Set<RoomPosition>;
    sources.forEach((source) => {
        let possiblePositions = room
            .lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
            .filter((terrain) => terrain.terrain != 'wall')
            .map((terrain) => new RoomPosition(terrain.x, terrain.y, source.room.name));

        //check to see if containers already exist
        let positionsWithContainers = possiblePositions.filter(
            (pos) => pos.lookFor(LOOK_STRUCTURES).filter((s) => s.structureType === STRUCTURE_CONTAINER).length
        );
        if (positionsWithContainers.length) {
            possiblePositions = positionsWithContainers;
        }

        let candidate = room.storage.pos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
        if (candidate) {
            containerPositions.add(candidate);
        }
    });

    if (containerPositions.size === sources.length) {
        room.memory.containerPositions = [];
        containerPositions.forEach((pos) => {
            room.memory.containerPositions.push(pos.toMemSafe());
            room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
        });
        return OK;
    }

    return ERR_NOT_FOUND;
}

function dropMiningContainersConstructed(): boolean {
    return false;
}

function calculateMinimumEnergy(): number {
    return 0;
}

function executePhaseShift() {}

function runPhaseTwo(room: Room) {}
