interface StructureSpawn {
    spawnMineralMiner(): ScreepsReturnCode;
    spawnMiner(): ScreepsReturnCode;
    spawnDistributor(): ScreepsReturnCode;
    spawnRemoteMiner: (remoteRoomName: string) => ScreepsReturnCode;
    spawnGatherer(remoteRoomName: string): ScreepsReturnCode;
    spawnReserver(remoteRoomName: string): ScreepsReturnCode;
    spawnManager(): ScreepsReturnCode;
    spawnWorker(roomContainsViolentHostiles?: boolean): ScreepsReturnCode;
    spawnKeeperExterminator(remoteRoomName: string): ScreepsReturnCode;
    spawnRemoteMineralMiner(remoteRoomName: string): ScreepsReturnCode;
    spawnAssignedCreep(assignment: SpawnAssignment): ScreepsReturnCode;
    spawnFirst(partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap?: number): ScreepsReturnCode;
    spawnMax(partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap?: number): ScreepsReturnCode;
    smartSpawn(body: BodyPartConstant[], name: string, opts?: SpawnOptions): ScreepsReturnCode;
}

interface SpawnOptions {
    boosts?: BoostType[];
    disableSort?: boolean;
}

interface BodyPartsNeeded {
    move: number;
    damage: number;
    heal: number;
    tough: number;
    calculatedTough: boolean;
    boostedTough: boolean;
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
