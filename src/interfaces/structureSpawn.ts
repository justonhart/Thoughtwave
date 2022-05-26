interface StructureSpawn {
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
