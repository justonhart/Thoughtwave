interface Memory {
    empire: EmpireMemory;
}

interface EmpireMemory {
    spawnAssignments?: SpawnAssignment[];
    colonizationOperations?: ColonizationOperation[]; //room names
    hostileRooms?: HostileRoom[];
    scoutAssignments?: { [roomName: string]: string[] }; //Map<roomName, targetRoomNames>
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

interface ColonizationOperation {
    destination: string; //room name
    origin: string; //room name
    stage: ColonizeStage;
    spawnPosition: string;
}

const enum ColonizeStage {
    CLAIM = 'Claim',
    BUILD = 'Build',
    COMPLETE = 'Complete',
}
