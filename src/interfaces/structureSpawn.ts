interface StructureSpawn {
    spawnMiner(): ScreepsReturnCode;
    spawnDistributor(): ScreepsReturnCode;
    spawnEarlyWorker(): ScreepsReturnCode;
    spawnPhaseTwoWorker(): ScreepsReturnCode;
    spawnAssignedCreep(assignment: SpawnAssignment): ScreepsReturnCode;
}
