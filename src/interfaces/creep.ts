interface CreepMemory {
    ready?: number;
    targetId2?: Id<Creep> | Id<Structure>; // In case creeps have a secondary target (rampart protectors or miners who need to clear out container before being able to go to their main target)
    gatheringLabResources?: boolean;
    needsBoosted?: boolean;
    labNeeds?: LabNeed[];
    resourceSource?: Id<Structure>;
    waypoints?: string[];
    link?: Id<StructureLink>;
    destination?: string;
    assignment?: string;
    targetId?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> | Id<Mineral> | Id<Source>;
    miningPos?: string;
    hasTTLReplacement?: boolean;
    gathering?: boolean;
    energySource?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin>;
    room?: string;
    role?: Role;
    operationId?: string;
    currentTaskPriority?: Priority;
    _m?: TravelState;
    scout?: ScoutMemory;
    combat?: CombatMemory;
    nextRole?: Role;
    storeRoadInMemory?: Id<StructureContainer>;
    sleepCollectTil?: number;
    stop?: boolean;
    spawnReplacementAt?: number;
    recycle?: boolean;
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
    squadTarget?: SquadTarget;
}

// Set a squad Target to change target prioritization for squadAttackers
const enum SquadTarget {
    PLAYER_ROOM,
    PLAYER_CREEPS,
    POWER_BANK,
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
    REMOTE_MINERAL_MINER = 'REMOTE_MINERAL_MINER',
}
