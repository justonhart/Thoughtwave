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
    memoryOptions: CreepMemory;
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
}

interface OperationOpts {
    originRoom?: string;
    operativeCount?: number;
    originOpts?: OriginOpts;
    targetPos?: string;
    resource?: ResourceConstant;
    expireAt?: number;
    portalLocations?: string[];
}

interface OriginOpts {
    minEnergyStatus?: EnergyStatus;
    maxLinearDistance?: number;
}

const enum OperationType {
    COLONIZE = 1,
    STERILIZE,
    COLLECTION,
    SECURE,
    ROOM_RECOVERY,
}

const enum OperationStage {
    PREPARE = 1,
    ACTIVE,
    CLAIM,
    BUILD,
    COMPLETE,
}
