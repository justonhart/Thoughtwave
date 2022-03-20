export default function populationControl(spawn: StructureSpawn) {
    const SPAWN_LIMIT = spawn.room.memory.sourceAccessPointCount * 2;
    const WORKER_LIMIT = SPAWN_LIMIT / 2;

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === spawn.room.name);

    let options: SpawnOptions = {
        memory: {
            room: spawn.room.name,
        },
    };

    if (roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length < WORKER_LIMIT) {
        options.memory.role = Role.WORKER;
        spawn.spawnCreep([WORK, CARRY, MOVE], `Creep ${Game.time}`, options);
    }
}
