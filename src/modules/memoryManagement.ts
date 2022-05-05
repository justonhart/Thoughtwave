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
    if (
        deadCreepMemory.role === Role.REMOTE_MINER &&
        Memory.rooms[deadCreepMemory.room].remoteAssignments[posFromMem(deadCreepMemory.assignment).roomName]
    ) {
        Memory.rooms[deadCreepMemory.room].remoteAssignments[posFromMem(deadCreepMemory.assignment).roomName].miners[deadCreepMemory.assignment] =
            AssignmentStatus.UNASSIGNED;
    }
    if (deadCreepMemory.role === Role.GATHERER && Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment]) {
        Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment].distributor = AssignmentStatus.UNASSIGNED;
    }
    if (deadCreepMemory.role === Role.RESERVER && Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment]) {
        Memory.rooms[deadCreepMemory.room].remoteAssignments[deadCreepMemory.assignment].reserver = AssignmentStatus.UNASSIGNED;
    }

    delete Memory.creeps[creepName];
}
