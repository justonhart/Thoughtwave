import { deleteExpiredRoomData, getEmpireData } from './data';
import { getAllRoomNeeds } from './resourceManagement';

export function manageMemory() {
    initMissingMemoryValues();

    for (let creepName in Memory.creeps) {
        if (!Game.creeps[creepName]) {
            handleDeadCreep(creepName);
        }
    }

    // Cleanup dead rooms
    if (Game.time % 100 === 0) {
        Object.keys(Memory.rooms)
            .filter((roomName) => !Game.rooms[roomName]?.controller?.my) // Owned rooms always have vision
            .forEach((roomName) => delete Memory.rooms[roomName]);
    }

    handleDeadSquads();

    // if(!!InterShardMemory.getLocal()){
    //     cleanIntershardOutboundList();
    // }

    //set map of all room resource needs
    global.resourceNeeds = getAllRoomNeeds();

    global.roomConstructionsChecked = false;

    global.identifierIncrement = 1;

    global.remoteSourcesChecked = false;

    global.empireData = getEmpireData();

    deleteExpiredRoomData();

    if (!Memory.priceMap || Game.time % 20000 === 0) {
        Memory.priceMap = getPriceMap();
    }
    mangeVisionRequests();
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

        Object.keys(Memory.rooms[roomName].remoteSources).forEach((source) => {
            let remoteRoomName = source.split('.')[2];

            if (!Game.creeps[Memory.rooms[roomName].remoteSources[source].miner]) {
                Memory.rooms[roomName].remoteSources[source].miner = AssignmentStatus.UNASSIGNED;
            }

            Memory.rooms[roomName].remoteSources[source].gatherers.forEach((gatherer, index) => {
                if (!Game.creeps[gatherer]) {
                    Memory.rooms[roomName].remoteSources[source].gatherers[index] = AssignmentStatus.UNASSIGNED;
                }
            });

            if (Memory.remoteData[remoteRoomName]?.reserver && !Game.creeps[Memory.remoteData[remoteRoomName].reserver]) {
                Memory.remoteData[remoteRoomName].reserver = AssignmentStatus.UNASSIGNED;
            }

            if (Memory.remoteData[remoteRoomName]?.keeperExterminator && !Game.creeps[Memory.remoteData[remoteRoomName].keeperExterminator]) {
                Memory.remoteData[remoteRoomName].keeperExterminator = AssignmentStatus.UNASSIGNED;
            }
        });
    });
}

function handleDeadCreep(deadCreepName: string) {
    let deadCreepMemory = Memory.creeps[deadCreepName];

    if (Game.rooms[deadCreepMemory.room]?.controller?.my && Memory.rooms[deadCreepMemory.room]) {
        if (deadCreepMemory.role === Role.MINER && Memory.rooms[deadCreepMemory.room].miningAssignments[(deadCreepMemory as MinerMemory).assignment] === deadCreepName) {
            Memory.rooms[deadCreepMemory.room].miningAssignments[(deadCreepMemory as MinerMemory).assignment] = AssignmentStatus.UNASSIGNED;
        } else if (
            deadCreepMemory.role === Role.REMOTE_MINER &&
            Memory.rooms[deadCreepMemory.room].remoteSources[(deadCreepMemory as RemoteMinerMemory).assignment]?.miner === deadCreepName
        ) {
            Memory.rooms[deadCreepMemory.room].remoteSources[(deadCreepMemory as RemoteMinerMemory).assignment].miner = AssignmentStatus.UNASSIGNED;
        } else if (deadCreepMemory.role === Role.GATHERER) {
            let source = Object.entries(Memory.rooms[deadCreepMemory.room].remoteSources).find(([source, data]) =>
                data.gatherers.includes(deadCreepName)
            )?.[0];
            if(source){
                Memory.rooms[deadCreepMemory.room].remoteSources[source].gatherers = Memory.rooms[deadCreepMemory.room].remoteSources[source].gatherers.filter(name => name !== deadCreepName);
            }
        } else if (deadCreepMemory.role === Role.RESERVER && Memory.remoteData[(deadCreepMemory as ReserverMemory).assignment]) {
            Memory.remoteData[deadCreepMemory.assignment].reserver = AssignmentStatus.UNASSIGNED;
        } else if (deadCreepMemory.role === Role.MINERAL_MINER) {
            Memory.rooms[deadCreepMemory.room].mineralMiningAssignments[(deadCreepMemory as MineralMinerMemory).assignment] =
                AssignmentStatus.UNASSIGNED;
        } else if (
            deadCreepMemory.role === Role.KEEPER_EXTERMINATOR &&
            Memory.remoteData[(deadCreepMemory as KeeperExterminatorMemory).assignment]?.keeperExterminator === deadCreepName
        ) {
            Memory.remoteData[(deadCreepMemory as KeeperExterminatorMemory).assignment].keeperExterminator = AssignmentStatus.UNASSIGNED;
        } else if (deadCreepMemory.role === Role.REMOTE_MINERAL_MINER && Memory.remoteData[deadCreepMemory.assignment]) {
            Memory.remoteData[(deadCreepMemory as RemoteMineralMinerMemory).assignment].mineralMiner = AssignmentStatus.UNASSIGNED;
        } else if (deadCreepMemory.role === Role.MANAGER && Memory.rooms[deadCreepMemory.room].transferBuffer) {
            // Edge case to remove any potential leftover entries in the transferBuffer
            const filteredTransferBuffer = Object.entries(Memory.rooms[deadCreepMemory.room].transferBuffer)
                .filter(([_, { creepName }]) => creepName !== deadCreepName)
                .reduce((acc, [resource, { amount, creepName }]) => Object.assign(acc, { [resource]: { amount, creepName } }), {});
            Memory.rooms[deadCreepMemory.room].transferBuffer = filteredTransferBuffer;
        }
    }

    if (deadCreepMemory.combat?.squadId) {
        if (Memory.squads?.[deadCreepMemory.combat.squadId]?.members?.[deadCreepMemory.combat.squadMemberType]) {
            delete Memory.squads?.[deadCreepMemory.combat.squadId]?.members?.[deadCreepMemory.combat.squadMemberType];
        }
    }

    delete Memory.creeps[deadCreepName];
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

//remove assignments to rooms that cannot spawn
function cleanSpawnAssignments() {
    Memory.spawnAssignments = Memory.spawnAssignments.filter(
        (assignment) => Game.rooms[assignment.designee] && Game.rooms[assignment.designee].canSpawn() && (!(assignment.spawnOpts.memory as OperativeMemory).operationId || !!Memory.operations[(assignment.spawnOpts.memory as OperativeMemory).operationId])
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
        Memory.operations = {};
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

    if (!Memory.visionRequests) {
        Memory.visionRequests = {};
    }

    if (!Memory.remoteSourceClaims) {
        Memory.remoteSourceClaims = {};
    }

    if (!Memory.remoteSourceAssignments) {
        Memory.remoteSourceAssignments = {};
    }

    if (!Memory.debug) {
        Memory.debug = {};
    }

    if (!Memory.cpuUsage) {
        Memory.cpuUsage = {
            average: 0,
            totalOverTime: 0,
        };
    }

    if (!Memory.resourceRequests) {
        Memory.resourceRequests = {};
    }

    if (!Memory.shipments) {
        Memory.shipments = {};
    }
}

function mangeVisionRequests() {
    const observerRooms = Object.keys(Game.rooms).filter((room) => Game.rooms[room]?.observer);

    Object.keys(Memory.visionRequests).forEach((requestId) => {
        const request = Memory.visionRequests[requestId];
        if (request.completed) {
            delete Memory.visionRequests[requestId];
            return;
        }

        if (!request.assigned) {
            let suitableRoom = observerRooms.find((room) => Game.map.getRoomLinearDistance(request.targetRoom, room) <= 10);
            if (suitableRoom) {
                if (!Memory.rooms[suitableRoom].visionRequests) {
                    Memory.rooms[suitableRoom].visionRequests = [requestId];
                } else {
                    Memory.rooms[suitableRoom].visionRequests.push(requestId);
                }
                Memory.visionRequests[requestId].assigned = true;
            }
            return;
        }
    });
}
