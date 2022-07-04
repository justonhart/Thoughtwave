import { manageOperations } from './operationsManagement';

export function manageEmpire() {
    if (!Memory.empire) {
        Memory.empire = {
            spawnAssignments: [],
            scoutAssignments: {},
        };
    }

    let needToInitIntershard = !JSON.parse(InterShardMemory.getLocal())?.outboundCreeps;
    if (needToInitIntershard) {
        InterShardMemory.setLocal(JSON.stringify({ outboundCreeps: { shard0: {}, shard1: {}, shard2: {}, shard3: {} } }));
    }

    if (Memory.empire.hostileRooms.length) {
        Memory.empire.hostileRooms.forEach((hostileRoom) => {
            Game.map.visual.rect(new RoomPosition(0, 0, hostileRoom.room), 50, 50, { fill: '#8b0000', stroke: '#8b0000', strokeWidth: 2 });
        });
    }

    if (!Memory.empire.priceMap || Game.time % 20000 === 0) {
        Memory.empire.priceMap = getPriceMap();
    }

    manageOperations();
    cleanSpawnAssignments();
}

export function addHostileRoom(roomName: string, expirationTicks: number = 8000) {
    if (!Memory.empire.hostileRooms.find((hostileRoom) => hostileRoom.room === roomName)) {
        Memory.empire.hostileRooms.push({ room: roomName, expireAt: Game.time + expirationTicks });
    }
}

export function unclaimRoom(roomName: string) {
    let room = Game.rooms[roomName];

    if (room?.controller?.my) {
        room.controller.unclaim();
    }

    if (room?.find(FIND_MY_CONSTRUCTION_SITES).length) {
        room.find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => site.remove());
    }

    Memory.empire.operations = Memory.empire.operations.filter((op) => op.targetRoom !== roomName);
    Memory.empire.spawnAssignments = Memory.empire.spawnAssignments.filter(
        (asssignment) => asssignment.designee !== roomName && asssignment.spawnOpts.memory.destination !== roomName
    );

    delete Memory.empire.scoutAssignments[roomName];

    let roomCreeps = Object.values(Game.creeps).filter((c) => c.memory.room === roomName);
    roomCreeps.forEach((creep) => {
        // delete creep memory to prevent automatic updates in memory management
        delete Memory.creeps[creep.name];
        creep.suicide();
    });

    Memory.rooms[roomName].unclaim = true;

    return 'done';
}

//remove assignments to rooms that cannot spawn
function cleanSpawnAssignments() {
    Memory.empire.spawnAssignments = Memory.empire.spawnAssignments.filter(
        (assignment) => Game.rooms[assignment.designee] && Game.rooms[assignment.designee].canSpawn()
    );
}

function getPriceMap(): { [resourceType: string]: number } {
    let history = Game.market.getHistory();
    let map: { [resourceType: string]: number } = {};
    history.forEach((res) => {
        map[res.resourceType] = res.avgPrice;
    });

    return map;
}
