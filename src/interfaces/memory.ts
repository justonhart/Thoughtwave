interface Memory {
    empire: EmpireMemory;
}

interface EmpireMemory {
    spawnAssignments?: SpawnAssignment[];
    colonizationOperations?: ColonizationOperation[]; //room names
}

interface SpawnAssignment {
    designee: string; //room name
    memoryOptions: CreepMemory;
    body: BodyPartConstant[];
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
