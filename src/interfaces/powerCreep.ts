interface PowerCreepMemory {
    room: string;
    cooldown: { [power: number]: number };
    targetId: Id<Source> | Id<StructurePowerSpawn> | Id<StructureController> | Id<StructureStorage> | Id<StructureSpawn>;
}

interface PowerCreep {
    onEdge: () => boolean;
    travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
    travelToRoom(roomName: string, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | IN_ROOM;
    addTaskToPriorityQueue(priority: Priority, actionCallback: () => void): void;
}
