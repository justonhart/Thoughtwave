export function posFromMem(memPos: string): RoomPosition {
    let split = memPos?.split('.');
    return split ? new RoomPosition(Number(split[0]), Number(split[1]), split[2]) : null;
}

export function manageMemory() {
    for (let creepName in Memory.creeps) {
        if (!Game.creeps[creepName]) {
            handleDeadCreep(creepName);
        }
    }

    handleDeadSquads();

    // if(!!InterShardMemory.getLocal()){
    //     cleanIntershardOutboundList();
    // }
}

export function validateAssignments() {
    Object.keys(Memory.rooms).forEach((roomName) => {
        let miningAssignments = Object.keys(Memory.rooms[roomName].miningAssignments);
        miningAssignments.forEach((a) => {
            if (
                Memory.rooms[roomName].miningAssignments[a] !== AssignmentStatus.ASSIGNED &&
                !Game.creeps[Memory.rooms[roomName].miningAssignments[a]]
            ) {
                Memory.rooms[roomName].miningAssignments[a] = AssignmentStatus.UNASSIGNED;
            }
        });

        let mineralMiningAssignments = Object.keys(Memory.rooms[roomName].mineralMiningAssignments);
        mineralMiningAssignments.forEach((a) => {
            if (
                Memory.rooms[roomName].mineralMiningAssignments[a] !== AssignmentStatus.ASSIGNED &&
                !Game.creeps[Memory.rooms[roomName].mineralMiningAssignments[a]]
            ) {
                Memory.rooms[roomName].mineralMiningAssignments[a] = AssignmentStatus.UNASSIGNED;
            }
        });

        let remoteRooms = Object.keys(Memory.rooms[roomName].remoteAssignments);
        remoteRooms.forEach((remoteRoomName) => {
            if (!Game.creeps[Memory.rooms[roomName].remoteAssignments[remoteRoomName].gatherer]) {
                Memory.rooms[roomName].remoteAssignments[remoteRoomName].gatherer = AssignmentStatus.UNASSIGNED;
            }

            if (!Game.creeps[Memory.rooms[roomName].remoteAssignments[remoteRoomName].reserver]) {
                Memory.rooms[roomName].remoteAssignments[remoteRoomName].reserver = AssignmentStatus.UNASSIGNED;
            }

            let remoteMiningAssignments = Object.keys(Memory.rooms[roomName].remoteAssignments[remoteRoomName].miners);
            remoteMiningAssignments.forEach((pos) => {
                if (!Game.creeps[Memory.rooms[roomName].remoteAssignments[remoteRoomName].miners[pos]]) {
                    Memory.rooms[roomName].remoteAssignments[remoteRoomName].miners[pos] = AssignmentStatus.UNASSIGNED;
                }
            });
        });

        // Memory.rooms[roomName].remoteMiningRooms.forEach(remoteRoomName => {
        //     if(!Game.creeps[Memory.remoteData[remoteRoomName].gatherer]){
        //         Memory.remoteData[remoteRoomName].gatherer = AssignmentStatus.UNASSIGNED;
        //     }

        //     if(!Game.creeps[Memory.remoteData[remoteRoomName].miner]){
        //         Memory.remoteData[remoteRoomName].miner = AssignmentStatus.UNASSIGNED;
        //     }

        //     if(Memory.remoteData[remoteRoomName].reserver && !Game.creeps[Memory.remoteData[remoteRoomName].reserver]){
        //         Memory.remoteData[remoteRoomName].reserver = AssignmentStatus.UNASSIGNED;
        //     }

        //     if(Memory.remoteData[remoteRoomName].keeperExterminator && !Game.creeps[Memory.remoteData[remoteRoomName].keeperExterminator]){
        //         Memory.remoteData[remoteRoomName].keeperExterminator = AssignmentStatus.UNASSIGNED;
        //     }
        // });
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
            Memory.rooms[deadCreepMemory.room].remoteAssignments[posFromMem(deadCreepMemory.assignment).roomName]
        ) {
            Memory.rooms[deadCreepMemory.room].remoteAssignments[posFromMem(deadCreepMemory.assignment).roomName].miners[deadCreepMemory.assignment] =
                AssignmentStatus.UNASSIGNED;
        }
        if (
            deadCreepMemory.role === Role.GATHERER &&
            Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment] &&
            Object.values(Memory.creeps).filter(
                (creep) => creep.room === deadCreepMemory.room && creep.role === Role.GATHERER && creep.assignment === deadCreepMemory.assignment
            ).length === 1
        ) {
            Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment].gatherer = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.role === Role.RESERVER && Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment]) {
            Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment].reserver = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.role === Role.MINERAL_MINER) {
            Memory.rooms[deadCreepMemory.room].mineralMiningAssignments[deadCreepMemory.assignment] = AssignmentStatus.UNASSIGNED;
        }
        if (deadCreepMemory.labRequests) {
            Memory.rooms[deadCreepMemory.room].labRequests.unshift(...deadCreepMemory.labRequests);
        }
    }

    if (deadCreepMemory.combat?.squadId) {
        delete Memory.squads[deadCreepMemory.combat.squadId].members[deadCreepMemory.combat.squadMemberType];
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
