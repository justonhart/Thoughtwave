export default function populationControl(spawn: StructureSpawn) {
    //arbitrary spawn limits until further notice
    const SPAWN_LIMIT = spawn.room.memory.sourceAccessPointCount * 2;
    const WORKER_LIMIT = SPAWN_LIMIT / 2;
    const UPGRADER_LIMIT = SPAWN_LIMIT / 4;
    const MAINTAINTER_LIMIT = SPAWN_LIMIT / 4;

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === spawn.room.name);

    let options: SpawnOptions = {
        memory: {
            room: spawn.room.name,
            _move: {},
        },
    };

    if (roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length < WORKER_LIMIT) {
        options.memory.role = Role.WORKER;
        spawn.spawnCreep([WORK, CARRY, MOVE], `${options.memory.role} ${Game.time}`, options);
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < UPGRADER_LIMIT) {
        options.memory.role = Role.UPGRADER;
        spawn.spawnCreep([WORK, CARRY, MOVE], `${options.memory.role} ${Game.time}`, options);
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < MAINTAINTER_LIMIT) {
        options.memory.role = Role.MAINTAINTER;
        spawn.spawnCreep([WORK, CARRY, MOVE], `${options.memory.role} ${Game.time}`, options);
    }
}
