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
}

function handleDeadCreep(creepName: string) {
    console.log(`May ${creepName} rest in peace`);

    let deadCreepMemory = Memory.creeps[creepName];

    if (deadCreepMemory.miningPos) {
        Memory.rooms[deadCreepMemory.room || deadCreepMemory.destination].availableSourceAccessPoints.push(deadCreepMemory.miningPos);
    }
    if (deadCreepMemory.role === Role.MINER) {
        Memory.rooms[deadCreepMemory.room].miningAssignments[deadCreepMemory.assignment] = AssignmentStatus.UNASSIGNED;
    }

    delete Memory.creeps[creepName];
}

export function unclaimRoom(roomName: string) {
    let room = Game.rooms[roomName];

    if (room?.controller?.my) {
        room.controller.unclaim();
    }

    if (room?.find(FIND_MY_CONSTRUCTION_SITES).length) {
        room.find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => site.remove());
    }

    Memory.empire.colonizationOperations = Memory.empire.colonizationOperations.filter((op) => op.destination !== roomName);
    Memory.empire.spawnAssignments = Memory.empire.spawnAssignments.filter((asssignment) => asssignment.designee !== roomName);

    delete Memory.rooms[roomName];

    return 'done';
}
