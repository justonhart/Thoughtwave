interface StructureSpawn {
    spawnMineralMiner(): ScreepsReturnCode;
    spawnMiner(): ScreepsReturnCode;
    spawnDistributor(): ScreepsReturnCode;
    spawnRemoteMiner: () => ScreepsReturnCode;
    spawnGatherer(): ScreepsReturnCode;
    spawnReserver(): ScreepsReturnCode;
    spawnManager(): ScreepsReturnCode;
    spawnWorker(): ScreepsReturnCode;
    spawnAssignedCreep(assignment: SpawnAssignment): ScreepsReturnCode;
    spawnFirst(partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap?: number): ScreepsReturnCode;
    spawnMax(partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap?: number): ScreepsReturnCode;
    smartSpawn(body: BodyPartConstant[], name: string, opts?: SpawnOptions): ScreepsReturnCode;
}

interface SpawnOptions {
    boosts?: BoostRequest[];
}

interface BoostRequest {
    type: BoostType;
    policy: BoostPolicy;
}

const enum BoostType {
    ATTACK = 1,
    RANGED_ATTACK,
    HEAL,
    HARVEST,
    BUILD,
    UPGRADE,
    DISMANTLE,
    MOVE,
    CARRY,
    TOUGH,
}

const enum BoostPolicy {
    IF_AVAILABLE = 1,
    NECESSARY,
}
