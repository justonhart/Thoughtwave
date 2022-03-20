export function posFromMem(memPos: string): RoomPosition {
    let split = memPos.split('.');
    return new RoomPosition(Number(split[0]), Number(split[1]), split[2]);
}

export function manageMemory() {
    for (let creepName in Memory.creeps) {
        if (!Game.creeps[creepName]) {
            handleDeadCreep(creepName);
        }
    }
}

function handleDeadCreep(creepName: string) {
    console.log(`May ${creepName} rest in peace`);

    var deadCreepMemory = Memory.creeps[creepName];

    if (deadCreepMemory.miningPos) {
        Game.rooms[deadCreepMemory.room].memory.availableSourceAccessPoints.push(deadCreepMemory.miningPos);
    }

    delete Memory.creeps[creepName];
}
