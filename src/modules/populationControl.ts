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
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < UPGRADER_LIMIT) {
        options.memory.role = Role.UPGRADER;
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < MAINTAINTER_LIMIT) {
        options.memory.role = Role.MAINTAINTER;
    }

    if (options.memory.role) {
        let partsArray: BodyPartConstant[] = [];
        let partsBlock = [WORK, CARRY, MOVE];

        for (let i = 0; i < Math.floor(spawn.room.energyCapacityAvailable / 200); i++) {
            partsArray = partsArray.concat(partsBlock);
        }

        let result = spawn.spawnCreep(partsArray, `${options.memory.role} ${Game.time}`, options);

        //if there are no harvesters, and there is not enough energy to spawn one
        if (result === ERR_NOT_ENOUGH_ENERGY && options.memory.role === Role.WORKER) {
            let potentialWorkers = roomCreeps.filter((creep) => creep.memory.role !== Role.WORKER && creep.getActiveBodyparts(WORK));
            if (potentialWorkers.length) {
                let creepToConvert = potentialWorkers.sort((creep) => creep.getActiveBodyparts(WORK)).shift();
                creepToConvert.memory.role = Role.WORKER;
                creepToConvert.memory.targetId = null;
            } else if (!_.filter(Game.creeps, (creep) => creep.memory.role === Role.WORKER && creep.memory.home === spawn.room.name).length) {
                //spawn first available harvester
                partsArray = [];
                for (let i = 0; i < Math.floor(spawn.room.energyAvailable / 200); i++) partsArray = partsArray.concat(partsBlock);
                spawn.spawnCreep(partsArray, `${options.memory.role} ${Game.time}`, options);
            }
        }
    }
}
