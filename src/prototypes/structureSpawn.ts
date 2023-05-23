import { PopulationManagement } from '../modules/populationManagement';

StructureSpawn.prototype.spawnMiner = function () {
    return PopulationManagement.spawnMiner(this);
};

StructureSpawn.prototype.spawnDistributor = function () {
    return PopulationManagement.spawnDistributor(this);
};

StructureSpawn.prototype.spawnRemoteMiner = function (source: string) {
    return PopulationManagement.spawnRemoteMiner(this, source);
};

StructureSpawn.prototype.spawnGatherer = function (source: string) {
    return PopulationManagement.spawnGatherer(this, source);
};

StructureSpawn.prototype.spawnReserver = function (remoteRoomName: string) {
    return PopulationManagement.spawnReserver(this, remoteRoomName);
};

StructureSpawn.prototype.spawnWorker = function (roomContainsViolentHostiles?: boolean) {
    return PopulationManagement.spawnWorker(this, roomContainsViolentHostiles);
};

StructureSpawn.prototype.spawnAssignedCreep = function (assignment: SpawnAssignment) {
    return PopulationManagement.spawnAssignedCreep(this, assignment);
};

StructureSpawn.prototype.spawnFirst = function (partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap: number = 15) {
    return PopulationManagement.spawnFirst(this, partsBlock, name, opts, levelCap);
};

StructureSpawn.prototype.spawnMax = function (partsBlock: BodyPartConstant[], name: string, opts?: SpawnOptions, levelCap: number = 15) {
    return PopulationManagement.spawnMax(this, partsBlock, name, opts, levelCap);
};

StructureSpawn.prototype.smartSpawn = function (body: BodyPartConstant[], name: string, opts?: SpawnOptions) {
    return PopulationManagement.smartSpawn(this, name, body, opts);
};

StructureSpawn.prototype.spawnManager = function () {
    return PopulationManagement.spawnManager(this);
};

StructureSpawn.prototype.spawnMineralMiner = function () {
    return PopulationManagement.spawnMineralMiner(this);
};

StructureSpawn.prototype.spawnKeeperExterminator = function (remoteRoomName: string) {
    return PopulationManagement.spawnKeeperExterminator(this, remoteRoomName);
};

StructureSpawn.prototype.spawnRemoteMineralMiner = function (remoteRoomName: string) {
    return PopulationManagement.spawnRemoteMineralMiner(this, remoteRoomName);
};

StructureSpawn.prototype.spawnScout = function () {
    return PopulationManagement.spawnScout(this);
};
