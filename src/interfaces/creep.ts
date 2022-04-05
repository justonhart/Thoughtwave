interface CreepMemory {
    destination?: string;
    assignment?: string;
    targetId?: Id<Structure> | Id<ConstructionSite>;
    miningPos?: string;
    gathering?: boolean;
    room?: string;
    role?: Role;
    currentTaskPriority?: Priority;
    _move?: MoveMemory;
    _m?: TravelData;
}

interface Creep {
    homeroom: Room;
    travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
    travelToRoom(roomName: string, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | IN_ROOM;
    onEdge(position: HasPos | RoomPosition): boolean;
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
    UPGRADER = 'Upgrader',
    MAINTAINTER = 'MAINTAINTER',
    DISTRIBUTOR = 'DISTRIBUTOR',
    TRANSPORTER = 'TRANSPORTER',
    MINER = 'MINER',
    CLAIMER = 'CLAIMER',
    COLONIZER = 'COLONIZER',
    BUILDER = 'BUILDER',
}
