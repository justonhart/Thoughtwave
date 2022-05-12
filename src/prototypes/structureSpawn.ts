import { PopulationManagement } from '../modules/populationManagement';

StructureSpawn.prototype.spawnMiner = function () {
    return PopulationManagement.spawnMiner(this);
};

StructureSpawn.prototype.spawnDistributor = function () {
    return PopulationManagement.spawnDistributor(this);
};

StructureSpawn.prototype.spawnRemoteMiner = function () {
    return PopulationManagement.spawnRemoteMiner(this);
};

StructureSpawn.prototype.spawnGatherer = function () {
    return PopulationManagement.spawnGatherer(this);
};

StructureSpawn.prototype.spawnReserver = function () {
    return PopulationManagement.spawnReserver(this);
};

StructureSpawn.prototype.spawnEarlyWorker = function () {
    return PopulationManagement.spawnEarlyWorker(this);
};

StructureSpawn.prototype.spawnPhaseTwoWorker = function () {
    return PopulationManagement.spawnPhaseTwoWorker(this);
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

StructureSpawn.prototype.smartSpawn = function (this: StructureSpawn, body: BodyPartConstant[], name: string, opts?: SpawnOptions) {
    let partsArrayCost = body.length ? body.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost) : 0;

    if (partsArrayCost - (this.room.memory.reservedEnergy ?? 0) > this.room.energyAvailable) {
        return ERR_NOT_ENOUGH_ENERGY;
    }

    let result = this.spawnCreep(body, name, opts);

    if (result !== OK) {
        console.log(`Unexpected result from smartSpawn in spawn ${this.name}: ${result} - body: ${body} - opts: ${JSON.stringify(opts)}`);
    }

    return result;
};
