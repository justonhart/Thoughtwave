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
    visionRequests?: { [id: string]: VisionRequest };
    remoteSourceClaims?: { [sourcePos: string]: { claimant: string; netIncome: number } }; //map of potential remote rooms to rooms intending to claim them and their anticipated net income - higher income gets priority
    remoteSourceAssignments?: { [sourcePos: string]: RemoteAssignmentData }; //maps sources in other rooms to owned rooms mining them
    debug?: DebugSettings;
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
    toughHitsRequired?: number;
    visionRequests?: string[];
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
    ADD_REMOTE_MINING,
}

const enum OperationStage {
    PREPARE = 1,
    ACTIVE,
    CLAIM,
    BUILD,
    COMPLETE,
}

interface VisionRequest {
    targetRoom: string; //roomname
    assigned?: boolean;
    onTick?: number; //what tick is the vision required? undefined = immediately
    completed?: boolean; //once need is done, mark completed to remove
}

interface DebugSettings {
    drawStamps?: boolean;
    logCpu?: boolean;
    drawRoads?: boolean;
    drawRemoteConnections?: boolean;
    logRoomPlacementCpu?: boolean;
}

interface RemoteAssignmentData {
    controllingRoom: string;
    estimatedIncome: number;
    roadLength: number;
}
