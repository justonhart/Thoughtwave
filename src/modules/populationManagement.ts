export function populationControl(spawn: StructureSpawn) {
    switch (spawn.room.memory?.phase) {
        case 1:
            phaseOneSpawning(spawn);
            break;
        case 2:
            phaseTwoSpawning(spawn);
            break;
    }
}

// function to calculate how many creeps a room can support
export function calculateEarlyCreepCapacity(room: Room): number {
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
    let restrictedCapacty = accessPointCount * 2;
    let creepCapacity = restrictedCapacty < creepsNeeded ? restrictedCapacty : creepsNeeded;

    return creepCapacity;
}

function phaseOneSpawning(spawn: StructureSpawn) {
    const SPAWN_LIMIT = calculateEarlyCreepCapacity(spawn.room);
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
        //if there are no worker, and there is not enough energy to spawn one immediately, convert another creep to worker
        if (result === ERR_NOT_ENOUGH_ENERGY && options.memory.role === Role.WORKER) {
            let potentialWorkers = roomCreeps.filter((creep) => creep.memory.role !== Role.WORKER && creep.getActiveBodyparts(WORK));
            if (potentialWorkers.length) {
                let creepToConvert = potentialWorkers.reduce((biggestWorkCreep, creepToCheck) =>
                    biggestWorkCreep.getActiveBodyparts(WORK) > creepToCheck.getActiveBodyparts(WORK) ? biggestWorkCreep : creepToCheck
                );
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

function phaseTwoSpawning(spawn: StructureSpawn) {
    const SPAWN_LIMIT = calculateWorkerCapacity(spawn.room);
    const UPGRADER_LIMIT = SPAWN_LIMIT / 2;
    const MAINTAINTER_LIMIT = SPAWN_LIMIT / 2;

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === spawn.room.name);

    let options: SpawnOptions = {
        memory: {
            room: spawn.room.name,
            _move: {},
        },
    };

    const WORKER_PART_BLOCK = [WORK, CARRY, MOVE];
    const TRANSPORT_PART_BLOCK = [CARRY, CARRY, MOVE];

    let partBlockToUse: BodyPartConstant[];

    if (roomCreeps.filter((creep) => creep.memory.role === Role.DISTRIBUTOR).length === 0) {
        options.memory.role = Role.DISTRIBUTOR;
        partBlockToUse = TRANSPORT_PART_BLOCK;
    } else if (needMiner(spawn.room)) {
        spawnMiner(spawn);
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.TRANSPORTER).length === 0) {
        options.memory.role = Role.TRANSPORTER;
        partBlockToUse = TRANSPORT_PART_BLOCK;
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < UPGRADER_LIMIT) {
        options.memory.role = Role.UPGRADER;
        partBlockToUse = WORKER_PART_BLOCK;
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < MAINTAINTER_LIMIT) {
        options.memory.role = Role.MAINTAINTER;
        partBlockToUse = WORKER_PART_BLOCK;
    }

    if (options.memory.role) {
        let partsArray = [];
        let partsBlockCost = partBlockToUse.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);

        for (let i = 0; i < Math.floor(spawn.room.energyCapacityAvailable / partsBlockCost); i++) {
            partsArray = partsArray.concat(partBlockToUse);
        }

        let result = spawn.spawnCreep(partsArray, `${options.memory.role} ${Game.time}`, options);
        //if there are no distributors, and there is not enough energy to spawn one immediately, convert the transporter to distributor
        if (result === ERR_NOT_ENOUGH_ENERGY && options.memory.role === Role.DISTRIBUTOR) {
            let distributorCandidate = roomCreeps.filter((creep) => creep.memory.role === Role.TRANSPORTER);
            if (distributorCandidate.length) {
                let creepToConvert = distributorCandidate.shift();
                creepToConvert.memory.role = Role.DISTRIBUTOR;
                creepToConvert.memory.targetId = null;
            } else {
                //spawn first available distributor
                partsArray = [];
                for (let i = 0; i < Math.floor(spawn.room.energyAvailable / partsBlockCost); i++) {
                    partsArray = partsArray.concat(partBlockToUse);
                }
                spawn.spawnCreep(partsArray, `${options.memory.role} ${Game.time}`, options);
            }
        }
    }
}

//find the number of workers a phase-two room can support
export function calculateWorkerCapacity(room: Room): number {
    //a "cycle" is 300 ticks - the amount of time a source takes to recharge
    const CYCLE_LENGTH = 300;

    //potentially useful values
    let sourceCount = room.find(FIND_SOURCES).length;
    let energyCapacity = room.energyCapacityAvailable;

    let sourceIncomePerCycle = sourceCount * 3000;
    let remoteIncomePerCycle = 0; //define this once we get remote harvesting working

    let totalIncomePerCycle = sourceIncomePerCycle + remoteIncomePerCycle;

    //cost to create [WORK, CARRY, MOVE] is 200 energy
    let maxPartsBlockPerCreep = Math.floor(energyCapacity / 200);

    //assuming there are no construction / maintenance jobs, all workers should be upgrading
    let upgadeWorkCostPerCyclePerCreep = maxPartsBlockPerCreep * UPGRADE_CONTROLLER_POWER * CYCLE_LENGTH;

    let spawnCost = maxPartsBlockPerCreep * 200;

    //creeps live for 1500 ticks -> 5 cycles
    let creepSpawnCostPerCyclePerCreep = spawnCost / 5;

    let energyExpenditurePerCyclePerCreep = creepSpawnCostPerCyclePerCreep + upgadeWorkCostPerCyclePerCreep;

    let creepCapacity = totalIncomePerCycle / energyExpenditurePerCyclePerCreep;

    return Math.ceil(creepCapacity);
}

function needMiner(room: Room): boolean {
    let roomNeedsMiner = Object.values(room.memory.miningAssignments).some((assignment) => assignment === AssignmentStatus.UNASSIGNED);

    return roomNeedsMiner;
}

function spawnMiner(spawn: StructureSpawn) {
    let assigmentKeys = Object.keys(spawn.room.memory.miningAssignments);
    let assigment = assigmentKeys.find((pos) => spawn.room.memory.miningAssignments[pos] === AssignmentStatus.UNASSIGNED);

    let options: SpawnOptions = {
        memory: {
            assignment: assigment,
            room: spawn.room.name,
            role: Role.MINER,
            _move: {},
        },
    };

    let minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE];

    if (spawn.spawnCreep(minerBody, `${options.memory.role} ${Game.time}`, options) === OK) {
        spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
    }
}
