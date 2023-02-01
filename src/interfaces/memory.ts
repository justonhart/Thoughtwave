interface Memory {
    remoteData: { [roomName: string]: RemoteData };
    roomData: { [roomName: string]: RoomData };
    priceMap?: { [resourceType: string]: number };
    logCPU?: boolean;
    spawnAssignments?: SpawnAssignment[];
    operations?: Operation[];
    playersToIgnore?: string[];
    squads?: { [squadId: string]: Squad };
    marketBlacklist?: string[]; //player names we don't want to sell to
    blacklistedRooms?: string[]; //room names we don't sell to
}

interface EmpireIntershard {
    outboundCreeps: OutboundCreeps;
}

interface OutboundCreeps {
    shard0: Map<string, OutboundCreepEntry>;
    shard1: Map<string, OutboundCreepEntry>;
    shard2: Map<string, OutboundCreepEntry>;
    shard3: Map<string, OutboundCreepEntry>;
}

interface OutboundCreepEntry {
    memory: CreepMemory;
    expirationTime: number;
}

interface SpawnAssignment {
    designee: string; //room name
    spawnOpts: SpawnOptions;
    body: BodyPartConstant[];
}

interface HostileRoom {
    room: string;
    expireAt: number; // Game Tick at which the room is no longer considered hostile
}

interface Operation {
    targetRoom: string;
    originRoom: string;
    stage: OperationStage;
    type: OperationType;
    operativeCount?: number;
    targetPos?: string;
    resource?: ResourceConstant;
    expireAt?: number;
    portalLocations?: string[];
    forcedDestinations?: string[];
    pathCost?: number;
}

interface OperationOpts {
    originRoom?: string;
    operativeCount?: number;
    originOpts?: OriginOpts;
    targetPos?: string;
    resource?: ResourceConstant;
    expireAt?: number;
    portalLocations?: string[];
    forcedDestinations?: string[];
    pathCost?: number;
}

interface OriginOpts {
    minEnergyStatus?: EnergyStatus;
    maxLinearDistance?: number;
    multipleSpawns?: boolean;
    needsBoost?: boolean;
    selectionCriteria?: OriginCriteria;
}

interface OriginResult {
    roomName: string;
    cost: number;
}

const enum OriginCriteria {
    HIGHEST_LEVEL,
    CLOSEST,
}

interface Squad {
    squadType: SquadType;
    members?: SquadMembers;
    forcedDestinations?: string[];
    assignment: string; // RoomName
    nextDirection?: DirectionConstant;
    isFleeing?: boolean;
    orientation?: TOP | RIGHT | BOTTOM | LEFT;
    anchor?: RIGHT | LEFT; // squadLeaders relative position (clockwise)
    lastRun?: number; // Game tick when squad logic was last executed (enables certain logic to only run once per squad)
    targetStructure?: Id<Structure>;
}

interface SquadMembers {
    squadLeader?: Id<Creep>;
    squadFollower?: Id<Creep>;
    squadSecondLeader?: Id<Creep>;
    squadSecondFollower?: Id<Creep>;
}

interface Shipment {
    destinationRoom: string;
    resource: ResourceConstant;
    amount: number;
    marketOrderId?: string;
}

interface FactoryTask {
    product: ResourceConstant;
    amount: number;
    started?: boolean;
}

const enum SquadType {
    DUO,
    QUAD,
}

const enum OperationType {
    COLONIZE = 1,
    STERILIZE,
    COLLECTION,
    SECURE,
    ROOM_RECOVERY,
    ATTACK,
    QUAD_ATTACK,
    UPGRADE_BOOST,
    REMOTE_BUILD,
    CLEAN,
}

const enum OperationStage {
    PREPARE = 1,
    ACTIVE,
    CLAIM,
    BUILD,
    COMPLETE,
}
