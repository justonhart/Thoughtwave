import { PopulationManagement } from '../modules/populationManagement';

StructureSpawn.prototype.spawnMiner = function () {
    return PopulationManagement.spawnMiner(this);
};

StructureSpawn.prototype.spawnDistributor = function () {
    return PopulationManagement.spawnDistributor(this);
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
