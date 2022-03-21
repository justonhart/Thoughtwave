export function populationControl(spawn: StructureSpawn) {
    const SPAWN_LIMIT = calculateCreepCapacity(spawn.room);
    const WORKER_LIMIT = SPAWN_LIMIT / 2;
    const UPGRADER_LIMIT = Math.floor(SPAWN_LIMIT / 4);
    const MAINTAINTER_LIMIT = Math.floor(SPAWN_LIMIT / 4);

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
        //if there are no worker, and there is not enough energy to spawn one immediately, convert another creep to worker
        if (result === ERR_NOT_ENOUGH_ENERGY && options.memory.role === Role.WORKER) {
            let potentialWorkers = roomCreeps.filter((creep) => creep.memory.role !== Role.WORKER && creep.getActiveBodyparts(WORK));
            if (potentialWorkers.length) {
                let creepToConvert = potentialWorkers.reduce((a, b) => (a.getActiveBodyparts(WORK) > b.getActiveBodyparts(WORK) ? a : b));
                creepToConvert.memory.role = Role.WORKER;
                creepToConvert.memory.targetId = null;
            } else if (roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length === 0) {
                //spawn first available worker
                partsArray = [];
                for (let i = 0; i < Math.floor(spawn.room.energyAvailable / 200); i++) partsArray = partsArray.concat(partsBlock);
                spawn.spawnCreep(partsArray, `${options.memory.role} ${Game.time}`, options);
            }
        }
    }
}

// function to calculate how many creeps a room can support
export function calculateCreepCapacity(room: Room): number {
    //potentially useful values
    let sourceCount = room.find(FIND_SOURCES).length;
    let accessPointCount = room.memory.sourceAccessPointCount;
    let maxEnergy = room.energyCapacityAvailable;

    //sources have 3k energy per 300 ticks -> 10 energy per tick
    //creeps harvest 2 energy per tick per WORK ==> 5 work blocks per source for 100% efficiency
    //let us assume creeps will spend approximately half of their time working (not mining) => 10 work blocks per source
    let workPartsPerSource = 10;

    //cost to create [WORK, CARRY, MOVE] is 200 energy
    let maxWorkPartsPerCreep = Math.floor(maxEnergy / 200);

    let workPartsNeeded = sourceCount * workPartsPerSource;
    let creepsNeeded = Math.ceil(workPartsNeeded / maxWorkPartsPerCreep);

    //creepsNeeded is likely to be VERY HIGH in early rooms (higher than the access point count may be able to accommodate), so cap based on access point count
    let restrictedCapacty = Math.ceil(accessPointCount * 2);
    let creepCapacity = restrictedCapacty < creepsNeeded ? restrictedCapacty : creepsNeeded;

    return creepCapacity;
}
