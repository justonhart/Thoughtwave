interface CreepMemory {
    gatheringLabResources?: boolean;
    needsBoosted?: boolean;
    labRequests?: LabNeed[];
    resourceSource?: Id<Structure>;
    portalLocations?: string[];
    link?: Id<StructureLink>;
    destination?: string;
    assignment?: string;
    targetId?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin>;
    miningPos?: string;
    hasTTLReplacement?: boolean;
    gathering?: boolean;
    energySource?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin>;
    room?: string;
    role?: Role;
    operation?: OperationType;
    currentTaskPriority?: Priority;
    _m?: TravelState;
    scout?: ScoutMemory;
    combat?: CombatMemory;
    nextRole?: Role;
}

interface Creep {
    moveOffExit: () => void;
    homeroom: Room;
    operation: Operation;
    travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
    travelToRoom(roomName: string, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND | IN_ROOM;
    onEdge(): boolean;
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

interface CombatMemory {
    flee?: boolean;
    healingTarget?: string;
    squadId?: string;
    squadMemberType?: SquadMemberType;
}

const enum SquadMemberType {
    SQUAD_LEADER,
    SQUAD_FOLLOWER,
    SQUAD_SECOND_LEADER,
    SQUAD_SECOND_FOLLOWER,
}

const enum Priority {
    LOW = 0,
    MEDIUM = 1,
    HIGH = 2,
}

const enum Role {
    WORKER = 'Worker',
    UPGRADER = 'Upgrader',
    DISTRIBUTOR = 'DISTRIBUTOR',
    REMOTE_MINER = 'REMOTE_MINER',
    GATHERER = 'GATHERER',
    TRANSPORTER = 'TRANSPORTER',
    MINER = 'MINER',
    CLAIMER = 'CLAIMER',
    COLONIZER = 'COLONIZER',
    SCOUT = 'SCOUT',
    PROTECTOR = 'PROTECTOR',
    RAMPART_PROTECTOR = 'RAMPART_PROTECTOR',
    GO = 'GO',
    RESERVER = 'RESERVER',
    MANAGER = 'MANAGER',
    OPERATIVE = 'OPERATIVE',
    SQUAD_ATTACKER = 'SQUAD_ATTACKER',
    MINERAL_MINER = 'MINERAL_MINER',
    INTERSHARD_TRAVELLER = 'INTERSHARD_TRAVELLER',
    KEEPER_EXTERMINATOR = 'KEEPER_EXTERMINATOR',
}
