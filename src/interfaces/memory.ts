interface Memory {
    empire: EmpireMemory;
}

interface EmpireMemory {
    spawnAssignments?: SpawnAssignment[];
    colonizationOperations?: ColonizationOperation[]; //room names
    hostileRooms?: HostileRoom[];
    scoutAssignments?: Map<string, string[]>; //Map<roomName, targetRoomNames>
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
