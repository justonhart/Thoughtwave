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

    // if(!!InterShardMemory.getLocal()){
    //     cleanIntershardOutboundList();
    // }
}

function handleDeadCreep(creepName: string) {
    console.log(`May ${creepName} rest in peace`);

    let deadCreepMemory = Memory.creeps[creepName];

    if (deadCreepMemory.miningPos) {
        Memory.rooms[deadCreepMemory.room || deadCreepMemory.destination].availableSourceAccessPoints?.push(deadCreepMemory.miningPos);
    }
    if (deadCreepMemory.role === Role.MINER) {
        Memory.rooms[deadCreepMemory.room].miningAssignments[deadCreepMemory.assignment] = AssignmentStatus.UNASSIGNED;
    }

    delete Memory.creeps[creepName];
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
