module.exports.loop = function () {
  // Test Logic ==> please put in proper spawning ;)
  let harvesters = Object.values(Game.creeps).filter((creep) => creep.memory.role == Role.HARVESTER);
  if (harvesters.length < 2) {
    Game.spawns.Spawn1.spawnCreep([WORK, CARRY, MOVE], 'test', { memory: { role: Role.HARVESTER } });
  }
};
