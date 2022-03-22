interface CreepMemory {
    targetId?: Id<Structure> | Id<ConstructionSite>;
    miningPos?: string;
    gathering?: boolean;
    room?: string;
    role?: Role;
    currentTaskPriority?: Priority;
    _move?: TravelData;
}

interface Creep {
    travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
    addTaskToPriorityQueue(priority: Priority, actionCallback: () => void): void;
    runPriorityQueueTask(): void;
}

interface PriorityQueue {
    creepId: string;
    priority: Priority;
    actionCallback: (creep: Creep) => void;
}

const enum Priority {
    LOW = 0,
    MEDIUM = 1,
    HIGH = 2,
}

const enum Role {
    WORKER = 'Worker',
    BUILDER = 'Builder',
    UPGRADER = 'Upgrader',
    MAINTAINTER = 'MAINTAINTER',
}
