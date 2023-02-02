import { deleteExpiredRoomData } from './data';
import { manageOperations } from './operationsManagement';
import { getAllRoomNeeds } from './resourceManagement';

export function manageMemory() {
    initMissingMemoryValues();

    for (let creepName in Memory.creeps) {
        if (!Game.creeps[creepName]) {
            handleDeadCreep(creepName);
        }
    }

    handleDeadSquads();

    // if(!!InterShardMemory.getLocal()){
    //     cleanIntershardOutboundList();
    // }

    //set map of all room resource needs
    global.resourceNeeds = getAllRoomNeeds();

    global.roomConstructionsChecked = false;

    deleteExpiredRoomData();

    let needToInitIntershard = !JSON.parse(InterShardMemory.getLocal())?.outboundCreeps;
    if (needToInitIntershard) {
        InterShardMemory.setLocal(JSON.stringify({ outboundCreeps: { shard0: {}, shard1: {}, shard2: {}, shard3: {} } }));
    }

    Object.keys(Memory.roomData)
        .filter((roomName) => Memory.roomData[roomName].hostile)
        .forEach((roomName) => {
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, { fill: '#8b0000', stroke: '#8b0000', strokeWidth: 2 });
        });

    if (!Memory.priceMap || Game.time % 20000 === 0) {
        Memory.priceMap = getPriceMap();
    }

    manageOperations();
    cleanSpawnAssignments();
}

export function validateAssignments() {
    Object.keys(Memory.rooms).forEach((roomName) => {
        let miningAssignments = Object.keys(Memory.rooms[roomName].miningAssignments);
        miningAssignments?.forEach((pos) => {
            if (!Game.creeps[Memory.rooms[roomName].miningAssignments[pos]]) {
                Memory.rooms[roomName].miningAssignments[pos] = AssignmentStatus.UNASSIGNED;
            }
        });

        let mineralMiningAssignments = Object.keys(Memory.rooms[roomName].mineralMiningAssignments);
        mineralMiningAssignments?.forEach((pos) => {
            if (!Game.creeps[Memory.rooms[roomName].mineralMiningAssignments[pos]]) {
                Memory.rooms[roomName].mineralMiningAssignments[pos] = AssignmentStatus.UNASSIGNED;
            }
        });

        Memory.rooms[roomName].remoteMiningRooms?.forEach((remoteRoomName) => {
            if (!Game.creeps[Memory.remoteData[remoteRoomName]?.gatherer]) {
                Memory.remoteData[remoteRoomName].gatherer = AssignmentStatus.UNASSIGNED;
            }

            if (!Game.creeps[Memory.remoteData[remoteRoomName]?.gathererSK]) {
                Memory.remoteData[remoteRoomName].gathererSK = AssignmentStatus.UNASSIGNED;
            }

            if (!Game.creeps[Memory.remoteData[remoteRoomName]?.miner]) {
                Memory.remoteData[remoteRoomName].miner = AssignmentStatus.UNASSIGNED;
            }

            if (Memory.remoteData[remoteRoomName]?.reserver && !Game.creeps[Memory.remoteData[remoteRoomName].reserver]) {
                Memory.remoteData[remoteRoomName].reserver = AssignmentStatus.UNASSIGNED;
            }

            if (Memory.remoteData[remoteRoomName]?.keeperExterminator && !Game.creeps[Memory.remoteData[remoteRoomName].keeperExterminator]) {
                Memory.remoteData[remoteRoomName].keeperExterminator = AssignmentStatus.UNASSIGNED;
            }
        });
    });
}

function handleDeadCreep(creepName: string) {
    let deadCreepMemory = Memory.creeps[creepName];

    if (Game.rooms[deadCreepMemory.room]?.controller?.my) {
        if (deadCreepMemory.role === Role.MINER && !deadCreepMemory.hasTTLReplacement) {
            Memory.rooms[deadCreepMemory.room].miningAssignments[deadCreepMemory.assignment] = AssignmentStatus.UNASSIGNED;
        }
        if (
            deadCreepMemory.role === Role.REMOTE_MINER &&
            Memory.rooms[deadCreepMemory.room].remoteMiningRooms?.includes(deadCreepMemory.assignment)
        ) {
            Memory.remoteData[deadCreepMemory.assignment].miner = AssignmentStatus.UNASSIGNED;
        }
        if (
            deadCreepMemory.role === Role.GATHERER &&
            Memory.rooms[deadCreepMemory.room].remoteMiningRooms?.includes(deadCreepMemory.assignment) &&
            Object.values(Memory.creeps).filter(
                (creep) => creep.room === deadCreepMemory.room && creep.role === Role.GATHERER && creep.assignment === deadCreepMemory.assignment
            ).length
        ) {
            if (Memory.remoteData[deadCreepMemory.assignment].gatherer === creepName) {
                Memory.remoteData[deadCreepMemory.assignment].gatherer = AssignmentStatus.UNASSIGNED;
            } else if (Memory.remoteData[deadCreepMemory.assignment].gathererSK === creepName) {
                Memory.remoteData[deadCreepMemory.assignment].gathererSK = AssignmentStatus.UNASSIGNED;
            }
        }
        if (deadCreepMemory.role === Role.RESERVER && Memory.rooms[deadCreepMemory.room].remoteMiningRooms?.includes(deadCreepMemory.assignment)) {
            Memory.remoteData[deadCreepMemory.assignment].reserver = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.role === Role.MINERAL_MINER) {
            Memory.rooms[deadCreepMemory.room].mineralMiningAssignments[deadCreepMemory.assignment] = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.role === Role.KEEPER_EXTERMINATOR) {
            Memory.remoteData[deadCreepMemory.assignment].keeperExterminator = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.role === Role.REMOTE_MINERAL_MINER) {
            Memory.remoteData[deadCreepMemory.assignment].mineralMiner = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.labRequests) {
            Memory.rooms[deadCreepMemory.room].labRequests.unshift(...deadCreepMemory.labRequests);
        }
    }

    if (deadCreepMemory.combat?.squadId) {
        if (Memory.squads?.[deadCreepMemory.combat.squadId]?.members?.[deadCreepMemory.combat.squadMemberType]) {
            delete Memory.squads?.[deadCreepMemory.combat.squadId]?.members?.[deadCreepMemory.combat.squadMemberType];
        }
    }

    delete Memory.creeps[creepName];
}

function handleDeadSquads() {
    if (Memory.squads) {
        for (const squadId in Memory.squads) {
            if (Memory.squads[squadId].members && !Object.keys(Memory.squads[squadId].members)?.length) {
                delete Memory.squads[squadId];
            }
        }
    }
}

//having some trouble getting this to work properly
function cleanIntershardOutboundList() {
    let intershard: EmpireIntershard = JSON.parse(InterShardMemory.getLocal());

    let update = false;

    let shard0Keys = Object.keys(intershard.outboundCreeps.shard0);
    shard0Keys.forEach((key) => {
        if (intershard.outboundCreeps.shard0[key].expirationTime <= Game.time) {
            console.log(`deleting ${key} from outbound list: expired at ${intershard.outboundCreeps.shard0[key].expirationTime} : now ${Game.time}`);
            delete intershard.outboundCreeps.shard0[key];
            update = true;
        }
    });

    let shard1Keys = Object.keys(intershard.outboundCreeps.shard1);
    shard1Keys.forEach((key) => {
        if (intershard.outboundCreeps.shard1[key].expirationTime <= Game.time) {
            console.log(`deleting ${key} from outbound list: expired at ${intershard.outboundCreeps.shard1[key].expirationTime} : now ${Game.time}`);
            delete intershard.outboundCreeps.shard1[key];
            update = true;
        }
    });

    let shard2Keys = Object.keys(intershard.outboundCreeps.shard2);
    shard2Keys.forEach((key) => {
        if (intershard.outboundCreeps.shard2[key].expirationTime <= Game.time) {
            console.log(`deleting ${key} from outbound list: expired at ${intershard.outboundCreeps.shard2[key].expirationTime} : now ${Game.time}`);
            delete intershard.outboundCreeps.shard2[key];
            update = true;
        }
    });

    let shard3Keys = Object.keys(intershard.outboundCreeps.shard3);
    shard3Keys.forEach((key) => {
        if (intershard.outboundCreeps.shard3[key].expirationTime <= Game.time) {
            console.log(`deleting ${key} from outbound list: expired at ${intershard.outboundCreeps.shard3[key].expirationTime} : now ${Game.time}`);
            delete intershard.outboundCreeps.shard3[key];
            update = true;
        }
    });

    if (update) {
        InterShardMemory.setLocal(JSON.stringify(intershard));
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

    Memory.operations = Memory.operations.filter((op) => op.targetRoom !== roomName);
    Memory.spawnAssignments = Memory.spawnAssignments.filter(
        (asssignment) => asssignment.designee !== roomName && asssignment.spawnOpts.memory.destination !== roomName
    );

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
    Memory.spawnAssignments = Memory.spawnAssignments.filter(
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

export function addHostileRoom(roomName: string) {
    if (!Memory.roomData[roomName]) {
        Memory.roomData[roomName] = { hostile: true, asOf: Game.time };
    }
    Memory.roomData[roomName].hostile = true;
    Memory.roomData[roomName].asOf = Game.time;
}

function initMissingMemoryValues() {
    if (!Memory.remoteData) {
        Memory.remoteData = {};
    }

    if (!Memory.roomData) {
        Memory.roomData = {};
    }

    if (!Memory.spawnAssignments) {
        Memory.spawnAssignments = [];
    }

    if (!Memory.operations) {
        Memory.operations = [];
    }

    if (!Memory.playersToIgnore) {
        Memory.playersToIgnore = [];
    }

    if (!Memory.squads) {
        Memory.squads = {};
    }

    if (!Memory.marketBlacklist) {
        Memory.marketBlacklist = [];
    }

    if (!Memory.blacklistedRooms) {
        Memory.blacklistedRooms = [];
    }
}
