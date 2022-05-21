interface CreepMemory {
    link?: Id<StructureLink>;
    destination?: string;
    assignment?: string;
    targetId?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone>;
    miningPos?: string;
    gathering?: boolean;
    room?: string;
    role?: Role;
    operation?: OperationType;
    currentTaskPriority?: Priority;
    _m?: TravelState;
    scout?: ScoutMemory;
}

interface Creep {
    homeroom: Room;
    operation: Operation;
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

interface ScoutMemory {
    path?: string[]; // Used for Pathfinding
    spawn?: string; // Spawn Position
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
    REMOTE_MINER = 'REMOTE_MINER',
    GATHERER = 'GATHERER',
    TRANSPORTER = 'TRANSPORTER',
    MINER = 'MINER',
    CLAIMER = 'CLAIMER',
    COLONIZER = 'COLONIZER',
    BUILDER = 'BUILDER',
    SCOUT = 'SCOUT',
    PROTECTOR = 'PROTECTOR',
    GO = 'GO',
    RESERVER = 'RESERVER',
    MANAGER = 'MANAGER',
    OPERATIVE = 'OPERATIVE',
}
