import { computeRoomNameFromDiff, getExitDirections, isCenterRoom, isKeeperRoom } from './data';
import { removeRemoteRoomMemory } from './remoteRoomManagement';
import { deleteRoad, getRoad, storeRoadInMemory } from './roads';
import { getStoragePos } from './roomDesign';

//Calculate maintenance cost of road to source per road decay cycle. Considers pre-existing roads in homeroom and roomData to be .5 cost of plains. Doesn't consider travel wear
function calculateSourceRoadStats(
    source: string,
    roomName: string,
    ignoreRoomDataRoads = false
): { road: RoomPosition[]; roadLength: number; maintenanceCost: number; miningPos: RoomPosition } {
    let storagePos: RoomPosition;
    let sourcePos = source.toRoomPos();

    try {
        storagePos = getStoragePos(Game.rooms[roomName]);
    } catch (e) {
        console.log(`Error getting storage pos: ${e}`);
        return { roadLength: -1, maintenanceCost: -1, miningPos: undefined, road: undefined };
    }

    const road = getRoad(storagePos, sourcePos, {
        allowedStatuses: [RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.VACANT],
        ignoreOtherRoads: ignoreRoomDataRoads,
        destRange: 1,
    });

    if (road.incomplete) {
        return { roadLength: -1, maintenanceCost: -1, miningPos: undefined, road: undefined };
    }
    let miningPos = road.path.pop();

    // let visualRooms = Array.from(new Set(path.path.map((pos) => pos.roomName)));
    // visualRooms.forEach((r) => {
    //     let rv = new RoomVisual(r);
    //     rv.poly(path.path.filter((p) => p.roomName === r));
    // });

    const MAINTENANCE_COST = road.cost / 2; //the cost matrix values for plains and swamp are 5x the decay value to prioritize pre-existing roads.
    const MAINTENANCE_COST_PER_CYCLE = (MAINTENANCE_COST / ROAD_DECAY_TIME) * ENERGY_REGEN_TIME; //roads decay every 1k ticks, whereas sources regen every 300
    return { road: road.path, roadLength: road.path.length, maintenanceCost: MAINTENANCE_COST_PER_CYCLE, miningPos: miningPos };
}

export function calculateRemoteSourceStats(source: string, roomName: string, ignoreRoomDataRoads = false): RemoteStats {
    //Energy output of source per regen cycle
    const SOURCE_OUTPUT_PER_CYCLE =
        isKeeperRoom(source.toRoomPos().roomName) || isCenterRoom(source.toRoomPos().roomName)
            ? SOURCE_ENERGY_KEEPER_CAPACITY
            : SOURCE_ENERGY_CAPACITY;

    let roadStats;
    try {
        roadStats = calculateSourceRoadStats(source, roomName, ignoreRoomDataRoads);
        if (roadStats.maintenanceCost === -1) {
            return undefined;
        }
    } catch (e) {
        console.log(`Caught error calculating road stats: ${e}`);
        return undefined;
    }

    //if another source is already being mined in this room, we can remove costs for room-level creeps: reserver, exterminator
    const ROOM_ALREADY_OPERATED = otherAssignedSourceInRoom(source);

    //Cost of road maintenance per source regen cycle
    const ROAD_MAINTENANCE_PER_CYCLE = roadStats.maintenanceCost;

    //cost of miner production per regen cycle
    const MINER_WORK_NEEDED = Math.ceil(SOURCE_OUTPUT_PER_CYCLE / HARVEST_POWER / ENERGY_REGEN_TIME) + 1; //+1 because miner needs to repair container
    const MINER_MOVE_NEEDED = Math.ceil((MINER_WORK_NEEDED + 1) / 2);
    const MINER_COST_PER_CYCLE =
        ((BODYPART_COST[CARRY] + MINER_WORK_NEEDED * BODYPART_COST[WORK] + MINER_MOVE_NEEDED * BODYPART_COST[MOVE]) / CREEP_LIFE_TIME) *
        ENERGY_REGEN_TIME;

    //cost of gatherer production per regen cycle
    //Ideally, gatherer will move all the energy from miner container to storage before it fills up.
    const CONTAINER_FILL_RATE = MINER_WORK_NEEDED * HARVEST_POWER;
    const TICKS_TO_FILL_CONTAINER = Math.ceil(CONTAINER_CAPACITY / CONTAINER_FILL_RATE);
    const CONTAINER_MAINTENANCE_PER_CYCLE = (CONTAINER_DECAY / REPAIR_POWER / CONTAINER_DECAY_TIME) * ENERGY_REGEN_TIME; //should be 150

    const MAX_GATHERER_CAPACITY = 1900;

    const ROAD_LENGTH = roadStats.roadLength;
    const GATHERER_TRIP_DURATION = ROAD_LENGTH * 3; //takes 3x the road length to make it back to storage (2 ticks per step to storage, 1 tick per step on return), so maximum road length allowed for ONE gatherer to do the job is 100

    //if the trip can't be completed before the container fills again, we'll need more than one gatherer for max efficiency
    const GATHERERS_NEEDED = Math.ceil(GATHERER_TRIP_DURATION / TICKS_TO_FILL_CONTAINER);

    const GATHERER_WORK_NEEDED = 2;
    const GATHERER_CARRY_NEEDED = 38;
    const GATHERER_MOVE_NEEDED = 10;
    const GATHERER_COST_PER_CYCLE =
        ((GATHERER_WORK_NEEDED * BODYPART_COST[WORK] + GATHERER_CARRY_NEEDED * BODYPART_COST[CARRY] + GATHERER_MOVE_NEEDED * BODYPART_COST[MOVE]) /
            CREEP_LIFE_TIME) *
        ENERGY_REGEN_TIME;

    const RESERVER_COST_PER_CYCLE = ROOM_ALREADY_OPERATED
        ? 0
        : ((BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) / CREEP_CLAIM_LIFE_TIME) * ENERGY_REGEN_TIME;

    const EXTERMINATOR_COST_PER_CYCLE =
        !isKeeperRoom(source.toRoomPos().roomName) || ROOM_ALREADY_OPERATED
            ? 0
            : ((BODYPART_COST[ATTACK] * 19 + BODYPART_COST[MOVE] * 25 + BODYPART_COST[HEAL] * 6) / CREEP_LIFE_TIME) * ENERGY_REGEN_TIME;

    const TOTAL_COSTS_PER_CYCLE =
        MINER_COST_PER_CYCLE +
        GATHERERS_NEEDED * GATHERER_COST_PER_CYCLE +
        RESERVER_COST_PER_CYCLE +
        EXTERMINATOR_COST_PER_CYCLE +
        CONTAINER_MAINTENANCE_PER_CYCLE +
        ROAD_MAINTENANCE_PER_CYCLE;
    const ESTIMATED_INCOME_PER_CYCLE = SOURCE_OUTPUT_PER_CYCLE - TOTAL_COSTS_PER_CYCLE;

    let stats: RemoteStats = {
        sourceSize: SOURCE_OUTPUT_PER_CYCLE,
        estimatedIncome: ESTIMATED_INCOME_PER_CYCLE,
        roadLength: ROAD_LENGTH,
        roadMaintenance: ROAD_MAINTENANCE_PER_CYCLE,
        containerMaintenance: CONTAINER_MAINTENANCE_PER_CYCLE,
        minerUpkeep: MINER_COST_PER_CYCLE,
        gathererCount: GATHERERS_NEEDED,
        gathererUpkeep: GATHERERS_NEEDED * GATHERER_COST_PER_CYCLE,
        reserverUpkeep: RESERVER_COST_PER_CYCLE,
        exterminatorUpkeep: EXTERMINATOR_COST_PER_CYCLE,
        miningPos: roadStats.miningPos,
        road: roadStats.road,
    };

    // for (let [key, value] of Object.entries(stats)) {
    //     if (key !== 'road') console.log(`${key}: ${value}`);
    // }

    return stats;
}

export function assignRemoteSource(source: string, roomName: string) {
    let current = Memory.remoteSourceAssignments[source];
    if (current) {
        removeSourceAssignment(source);
    }
    try {
        let stats: RemoteStats;
        try {
            stats = calculateRemoteSourceStats(source, roomName);
        } catch (e) {
            console.log('problem calculating source stats: ' + e);
            return ERR_INVALID_ARGS;
        }

        try {
            let result = storeRoadInMemory(getStoragePos(Game.rooms[roomName]), stats.miningPos, stats.road);
            if (result !== OK) {
                console.log('problem storing road to source in memory');
                return ERR_INVALID_ARGS;
            }
        } catch (e) {
            console.log(e);
            return ERR_INVALID_ARGS;
        }

        let gatherers = [];
        for (let i = 0; i < stats.gathererCount; i++) {
            gatherers.push(AssignmentStatus.UNASSIGNED);
        }

        Memory.remoteSourceAssignments[source] = {
            controllingRoom: roomName,
            estimatedIncome: stats.estimatedIncome,
            roadLength: stats.roadLength,
        };

        Memory.rooms[roomName].remoteSources[source] = {
            gatherers: gatherers,
            miner: AssignmentStatus.UNASSIGNED,
            miningPos: stats.miningPos.toMemSafe(),
            setupStatus: RemoteSourceSetupStatus.BUILDING_CONTAINER,
        };

        let remoteRoomName = source.toRoomPos().roomName;
        let remoteData: RemoteData = {
            threatLevel: RemoteRoomThreatLevel.SAFE,
        };

        if (!Memory.remoteData[remoteRoomName]) {
            if (isKeeperRoom(remoteRoomName)) {
                remoteData.keeperExterminator = AssignmentStatus.UNASSIGNED;
            } else if (!isCenterRoom(remoteRoomName)) {
                remoteData.reservationState = RemoteRoomReservationStatus.LOW;
                remoteData.reserver = AssignmentStatus.UNASSIGNED;
            }
            if (isKeeperRoom(remoteRoomName) || isCenterRoom(remoteRoomName)) {
                remoteData.mineralMiner = AssignmentStatus.UNASSIGNED;
                remoteData.mineralAvailableAt = Game.time;
            }

            Memory.remoteData[remoteRoomName] = remoteData;
        }
        return OK;
    } catch (e) {
        console.log(e);
        return ERR_INVALID_ARGS;
    }
}

export function removeSourceAssignment(source: string) {
    let current = Memory.remoteSourceAssignments[source];
    deleteRoad(`${getStoragePos(Game.rooms[current.controllingRoom])}:${Memory.rooms[current.controllingRoom].remoteSources[source].miningPos}`);
    Game.creeps[Memory.rooms[current.controllingRoom].remoteSources[source]?.miner]?.suicide();
    Memory.rooms[current.controllingRoom].remoteSources[source]?.gatherers.forEach((g) => Game.creeps[g]?.suicide());
    delete Memory.rooms[current.controllingRoom].remoteSources[source];
    delete Memory.remoteSourceAssignments[source];
    let roomName = source.split('.')[2];
    if (!otherAssignedSourceInRoom(source)) {
        removeRemoteRoomMemory(roomName);
    }
}

export function findRemoteMiningOptions(roomName: string, noKeeperRooms?: boolean): { source: string; stats: RemoteStats }[] {
    let exits = getExitDirections(roomName);
    let safeRoomsDepthOne: string[] = []; //rooms we can pass through for mining
    for (let exit of exits) {
        let nextRoomName =
            exit === LEFT || exit === RIGHT
                ? computeRoomNameFromDiff(roomName, exit === LEFT ? -1 : 1, 0)
                : computeRoomNameFromDiff(roomName, 0, exit === BOTTOM ? -1 : 1);
        if (
            [RoomMemoryStatus.VACANT, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER].includes(
                Memory.roomData[nextRoomName]?.roomStatus
            ) && noKeeperRooms
                ? !isKeeperRoom(nextRoomName) && !isCenterRoom(nextRoomName)
                : true
        ) {
            safeRoomsDepthOne.push(nextRoomName);
        }
    }

    let safeRoomsDepthTwo: string[] = [];
    for (let depthOneRoomName of safeRoomsDepthOne.filter((room) => !isKeeperRoom(room) || Memory.remoteData[room])) {
        let depthOneExits = getExitDirections(depthOneRoomName);
        for (let exit of depthOneExits) {
            let nextRoomName =
                exit === LEFT || exit === RIGHT
                    ? computeRoomNameFromDiff(depthOneRoomName, exit === LEFT ? -1 : 1, 0)
                    : computeRoomNameFromDiff(depthOneRoomName, 0, exit === BOTTOM ? -1 : 1);
            if (
                [RoomMemoryStatus.VACANT, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER].includes(
                    Memory.roomData[nextRoomName]?.roomStatus
                ) &&
                !safeRoomsDepthOne.includes(nextRoomName) &&
                (noKeeperRooms ? !isKeeperRoom(nextRoomName) && !isCenterRoom(nextRoomName) : true)
            ) {
                safeRoomsDepthTwo.push(nextRoomName);
            }
        }
    }

    let safeRoomsDepthThree: string[] = [];
    for (let depthTwoRoomName of safeRoomsDepthTwo.filter((room) => !isKeeperRoom(room) || Memory.remoteData[room])) {
        let depthTwoExits = getExitDirections(depthTwoRoomName);
        for (let exit of depthTwoExits) {
            let nextRoomName =
                exit === LEFT || exit === RIGHT
                    ? computeRoomNameFromDiff(depthTwoRoomName, exit === LEFT ? -1 : 1, 0)
                    : computeRoomNameFromDiff(depthTwoRoomName, 0, exit === BOTTOM ? -1 : 1);
            if (
                [RoomMemoryStatus.VACANT, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER].includes(
                    Memory.roomData[nextRoomName]?.roomStatus
                ) &&
                !safeRoomsDepthOne.includes(nextRoomName) &&
                !safeRoomsDepthTwo.includes(nextRoomName) &&
                !isKeeperRoom(nextRoomName) &&
                !isCenterRoom(nextRoomName)
            ) {
                safeRoomsDepthThree.push(nextRoomName);
            }
        }
    }

    console.log(safeRoomsDepthOne);
    console.log(safeRoomsDepthTwo);
    console.log(safeRoomsDepthThree);
    console.log([
        ..._.flatten(safeRoomsDepthOne.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
        ..._.flatten(safeRoomsDepthTwo.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
        ..._.flatten(safeRoomsDepthThree.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
    ]);

    let openSources: { source: string; stats: RemoteStats }[] = [
        ..._.flatten(safeRoomsDepthOne.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
        ..._.flatten(safeRoomsDepthTwo.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
        ..._.flatten(safeRoomsDepthThree.map((r) => Memory.roomData[r].sources.map((s) => `${s}.${r}`))),
    ]
        .filter((source) => !Memory.remoteSourceAssignments[source])
        .map((source) => {
            let stats = calculateRemoteSourceStats(source, roomName, true);
            return { source, stats };
        });

    return openSources;
}

export function findSuitableRemoteSource(roomName: string, noKeeperRooms: boolean = false): { source: string; stats: RemoteStats } {
    let options = findRemoteMiningOptions(roomName, noKeeperRooms);

    let remoteRooms = new Set(Object.keys(Memory.rooms[roomName].remoteSources)?.map((pos) => pos.split('.')[2]));
    let keeperRoomsMined = 0;
    let otherRoomsMined = 0;

    remoteRooms.forEach((remoteRoom) => (isKeeperRoom(remoteRoom) || isCenterRoom(remoteRoom) ? keeperRoomsMined++ : otherRoomsMined++));

    //options.forEach(option => console.log(`${option.source}: ${option.stats?.netIncome}`))

    if (noKeeperRooms || Game.rooms[roomName].controller.level < 7 || keeperRoomsMined >= 2) {
        //pre-7 rooms can't handle central room upkeep
        options = options.filter((option) => option.stats?.sourceSize === 3000);
    }

    options = options.filter((option) => option.stats.estimatedIncome / option.stats.gathererCount >= 750);

    //prefer central rooms over other rooms and prefer closer to farther
    options.sort((a, b) => b.stats.estimatedIncome - a.stats.estimatedIncome);

    return options.shift();
}

export function otherAssignedSourceInRoom(source: string): boolean {
    return Object.keys(Memory.remoteSourceAssignments).some(
        (otherSource) => otherSource.split('.')[2] === source.split('.')[2] && otherSource !== source
    );
}
