interface Memory {
    empire: EmpireMemory;
}

interface EmpireMemory {
    logCPU?: boolean;
    spawnAssignments?: SpawnAssignment[];
    hostileRooms?: HostileRoom[];
    scoutAssignments?: { [roomName: string]: string[] }; //Map<roomName, targetRoomNames>
    operations?: Operation[];
    playersToIgnore?: string[];
    squads?: { [squadId: string]: Squad };
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
}

interface OriginResult {
    roomName: string;
    cost: number;
}

interface Squad {
    squadType: SquadType;
    members?: SquadMembers;
    forcedDestinations?: string[];
    assignment: string; // RoomName
    orientation?: TOP | RIGHT | BOTTOM | LEFT;
    anchor?: RIGHT | LEFT; // squadLeaders relative position (clockwise)
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
    ready: boolean;
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
}

const enum OperationStage {
    PREPARE = 1,
    ACTIVE,
    CLAIM,
    BUILD,
    COMPLETE,
}
