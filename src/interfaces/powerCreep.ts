interface PowerCreepMemory {
    cooldown: { [power: number]: number };
    targetId: Id<Source> | Id<StructurePowerSpawn> | Id<StructureController> | Id<StructureStorage> | Id<StructureSpawn>;
}

interface PowerCreep {
    travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
    addTaskToPriorityQueue(priority: Priority, actionCallback: () => void): void;
}
