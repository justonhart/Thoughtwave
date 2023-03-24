import { isCenterRoom, isKeeperRoom } from './data';
import { getStoragePos } from './roomDesign';

//Calculate maintenance cost of road to source per road decay cycle. Considers pre-existing roads in homeroom and roomData to be .5 cost of plains. Doesn't consider travel wear
export function calculateRoadStats(
    sourcePos: RoomPosition,
    room: Room,
    ignoreRoomDataRoads = false
): { roadLength: number; maintenanceCost: number } {
    let storagePos = getStoragePos(room);

    const path = PathFinder.search(
        storagePos,
        { pos: sourcePos, range: 1 },
        {
            plainCost: (2 * ROAD_DECAY_AMOUNT) / REPAIR_POWER,
            swampCost: (2 * ROAD_DECAY_AMOUNT * 5) / REPAIR_POWER,
            roomCallback: (roomName: string) => {
                if (
                    roomName !== room.name &&
                    ![RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.VACANT].includes(
                        Memory.roomData[roomName]?.roomStatus
                    )
                ) {
                    return false;
                }

                let matrix = new PathFinder.CostMatrix();

                if (roomName === room.name) {
                    room.stamps?.road.forEach((r) => {
                        if (r.rcl <= room.controller.level) matrix.set(r.pos.x, r.pos.y, 1);
                    });
                }

                if (!ignoreRoomDataRoads) {
                    let roads = Memory.roomData[roomName]?.roads ? Object.values(Memory.roomData[roomName].roads) : [];
                    if (roads?.length) {
                        roads.forEach((road) =>
                            road.split(',').forEach((posString) => {
                                let split = posString.split(':').map((v) => parseInt(v));
                                matrix.set(split[0], split[1], 1);
                            })
                        );
                    }
                }

                return matrix;
            },
            maxOps: 10000,
        }
    );

    if (path.incomplete) {
        return { roadLength: -1, maintenanceCost: -1 };
    }

    let visualRooms = Array.from(new Set(path.path.map((pos) => pos.roomName)));
    visualRooms.forEach((r) => {
        let rv = new RoomVisual(r);
        rv.poly(path.path.filter((p) => p.roomName === r));
    });

    const MAINTENANCE_COST = path.cost / 2; //the cost matrix values for plains and swamp are 5x the decay value to prioritize pre-existing roads.
    const MAINTENANCE_COST_PER_CYCLE = (MAINTENANCE_COST / ROAD_DECAY_TIME) * ENERGY_REGEN_TIME; //roads decay every 1k ticks, whereas sources regen every 300
    return { roadLength: path.path.length, maintenanceCost: MAINTENANCE_COST_PER_CYCLE };
}

export function calculateRemoteSourceStats(sourcePos: RoomPosition, room: Room, ignoreRoomDataRoads = false) {
    //Energy output of source per regen cycle
    const SOURCE_OUTPUT_PER_CYCLE =
        isKeeperRoom(sourcePos.roomName) || isCenterRoom(sourcePos.roomName) ? SOURCE_ENERGY_KEEPER_CAPACITY : SOURCE_ENERGY_CAPACITY;

    const roadStats = calculateRoadStats(sourcePos, room, ignoreRoomDataRoads);

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

    const RESERVER_COST_PER_CYCLE = ((BODYPART_COST[CLAIM] + BODYPART_COST[MOVE]) / CREEP_CLAIM_LIFE_TIME) * ENERGY_REGEN_TIME;

    const TOTAL_COSTS_PER_CYCLE =
        MINER_COST_PER_CYCLE +
        GATHERERS_NEEDED * GATHERER_COST_PER_CYCLE +
        RESERVER_COST_PER_CYCLE +
        CONTAINER_MAINTENANCE_PER_CYCLE +
        ROAD_MAINTENANCE_PER_CYCLE;
    const NET_INCOME_PER_CYCLE = SOURCE_OUTPUT_PER_CYCLE - TOTAL_COSTS_PER_CYCLE;

    let stats = {
        netIncome: NET_INCOME_PER_CYCLE,
        roadLength: ROAD_LENGTH,
        roadMaintenance: ROAD_MAINTENANCE_PER_CYCLE,
        containerMaintenance: CONTAINER_MAINTENANCE_PER_CYCLE,
        minerUpkeep: MINER_COST_PER_CYCLE,
        gathererCount: GATHERERS_NEEDED,
        gathererUpkeep: GATHERER_COST_PER_CYCLE,
        reserverUpkeep: RESERVER_COST_PER_CYCLE,
    };

    for (let [key, value] of Object.entries(stats)) {
        console.log(`${key}: ${value}`);
    }

    return stats;
}
