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

export function unclaimRoom(room: Room) {
    if (room?.controller?.my) {
        room.controller.unclaim();
    }

    if (room?.find(FIND_MY_CONSTRUCTION_SITES).length) {
        room.find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => site.remove());
    }

    let colonizeIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === room.name);
    if (colonizeIndex !== -1) {
        Memory.empire.colonizationOperations.splice(colonizeIndex, 1);
    }

    delete Memory.rooms[room.name];

    return 'done';
}
