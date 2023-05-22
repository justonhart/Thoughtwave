interface CreepMemory {
    debug?: boolean;
    ready?: number;
    targetId2?: Id<Creep> | Id<Structure>; // In case creeps have a secondary target (rampart protectors or miners who need to clear out container before being able to go to their main target)
    gatheringLabResources?: boolean;
    needsBoosted?: boolean;
    labNeeds?: LabNeed[];
    resourceSource?: Id<Structure>;
    waypoints?: string[];
    destination?: string;
    assignment?: string;
    targetId?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin> | Id<Mineral> | Id<Source>;
    miningPos?: string;
    gathering?: boolean;
    energySource?: Id<Structure> | Id<ConstructionSite> | Id<Creep> | Id<Resource> | Id<Tombstone> | Id<Ruin>;
    room?: string;
    /**
     * The job the creep performs. Job functions defined in src/roles/
     */
    role?: Role;
    operationId?: string;
    /**
     * The empire's priority of the creep's current task. Used for determining which creep shove outcomes
     */
    currentTaskPriority?: Priority;
    _m?: TravelState;
    combat?: CombatMemory;
    nextRole?: Role;
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

interface ScoutMemory extends CreepMemory {
    /**
     * A list of all rooms visited AND the depth of that particular visit. Depth is tracked so creeps don't block the room later
     */
    roomsVisited?: { depth: number; roomName: string }[];
    /**
     * A string made from concatenated DirectionConstants from the origin point
     */
    pathTree?: string;
    /**
     * The room the scout was in last tick
     */
    roomLastTick?: string;
    /**
     * The room the scout is travelling to
     */
    nextRoom?: string;
    /**
     * The number of rooms the creep should move from origin
     */
    maxDepth?: number;
    /**
     * If true, the creep is done exploring this node's children and is returning to the previous node
     */
    returnToLastRoom?: boolean;
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

interface MinerMemory extends CreepMemory {
    /**
     * Link the miner uses to send energy back to manager
     */
    link?: Id<StructureLink>;
    /**
     * RoomPosition the miner stands on to work
     */
    assignment: string;
}
