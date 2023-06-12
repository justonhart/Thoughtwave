export function defendHomeRoom(room: Room) {
    if (room.memory.threatLevel <= HomeRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS) {
        return;
    }

    try {
        // Run Tower/Creep defense
        // Spawn for active defense (rampart protectors + watchers in exit rooms)
        // Set defense positions
    } catch (e) {
        console.log(`Error caught in ${room.name} combatPlanner: \n${e}`);
    }
}

export function defendRemoteMiningRoom(room: Room) {
    if (Memory.remoteData[room.name].threatLevel === RemoteRoomThreatLevel.SAFE) {
        return;
    }
}
