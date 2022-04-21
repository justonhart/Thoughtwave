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
    const UPGRADER_LIMIT = Math.ceil(SPAWN_LIMIT / 4);
    const MAINTAINTER_LIMIT = Math.ceil(SPAWN_LIMIT / 4);
    const BUILDER_LIMIT = Math.ceil(SPAWN_LIMIT / 8);
    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === spawn.room.name);

    let options: SpawnOptions = {
        memory: {
            room: spawn.room.name,
        },
    };

    if (roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length < WORKER_LIMIT) {
        options.memory.role = Role.WORKER;
    } else if (checkForSpawnAssignments(spawn.room)) {
        spawnAssignedCreep(spawn);
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < UPGRADER_LIMIT && !spawn.room.controller.upgradeBlocked) {
        options.memory.role = Role.UPGRADER;
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < MAINTAINTER_LIMIT) {
        options.memory.role = Role.MAINTAINTER;
    } else if (
        roomCreeps.filter((creep) => creep.memory.role === Role.BUILDER).length < BUILDER_LIMIT &&
        spawn.room.find(FIND_MY_CONSTRUCTION_SITES).length
    ) {
        options.memory.role = Role.BUILDER;
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
    const WORKER_CAPACITY = calculateWorkerCapacity(spawn.room);

    let upgraderLimit: number, maintainerLimit: number, builderLimit: number;

    switch (spawn.room.energyStatus) {
        case EnergyStatus.CRITICAL:
            upgraderLimit = 0;
            maintainerLimit = 0;
            builderLimit = 0;
            break;
        case EnergyStatus.RECOVERING:
            upgraderLimit = spawn.room.controller.ticksToDowngrade < 10000 ? 1 : 0;
            maintainerLimit = 1;
            builderLimit = 0;
            break;
        case EnergyStatus.STABLE:
            upgraderLimit = WORKER_CAPACITY - 1;
            maintainerLimit = 2; //spawn two half-sized maintainers
            builderLimit = WORKER_CAPACITY / 2; //consume an additional 50% energy
            break;
        case EnergyStatus.SURPLUS:
            upgraderLimit = WORKER_CAPACITY - 1 + getAdditionalUpgraderCount(spawn.room);
            maintainerLimit = 2; //spawn two half-sized maintainers
            builderLimit = WORKER_CAPACITY / 2; //consume an additional 50% energy
            break;
    }

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === spawn.room.name);

    let options: SpawnOptions = {
        memory: {
            room: spawn.room.name,
        },
    };

    const WORKER_PART_BLOCK = [WORK, CARRY, MOVE];
    const TRANSPORT_PART_BLOCK = [CARRY, CARRY, MOVE];

    let partBlockToUse: BodyPartConstant[];
    let partsArray = [];
    let creepLevelCap = Math.min(15, Math.floor(spawn.room.energyCapacityAvailable / 200));

    if (roomCreeps.filter((creep) => creep.memory.role === Role.DISTRIBUTOR).length === 0) {
        options.memory.role = Role.DISTRIBUTOR;
        partBlockToUse = TRANSPORT_PART_BLOCK;
        creepLevelCap = 10;
    } else if (needMiner(spawn.room)) {
        spawnMiner(spawn);
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.TRANSPORTER).length === 0 && spawn.room.energyStatus >= EnergyStatus.STABLE) {
        options.memory.role = Role.TRANSPORTER;
        partBlockToUse = TRANSPORT_PART_BLOCK;
        creepLevelCap = 10;
    } else if (checkForSpawnAssignments(spawn.room)) {
        spawnAssignedCreep(spawn);
    } else if (
        roomCreeps.filter((creep) => creep.memory.role === Role.BUILDER).length < builderLimit &&
        spawn.room.find(FIND_MY_CONSTRUCTION_SITES).length
    ) {
        options.memory.role = Role.BUILDER;
        partBlockToUse = WORKER_PART_BLOCK;
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < upgraderLimit) {
        options.memory.role = Role.UPGRADER;
        partBlockToUse = WORKER_PART_BLOCK;
    } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < maintainerLimit) {
        options.memory.role = Role.MAINTAINTER;
        partBlockToUse = WORKER_PART_BLOCK;
        creepLevelCap = creepLevelCap / 2;
    }

    if (options.memory.role) {
        if (partBlockToUse) {
            partsArray = createPartsArray(partBlockToUse, spawn.room.energyCapacityAvailable, creepLevelCap);
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
                for (let i = 0; i < Math.floor(spawn.room.energyAvailable / 150); i++) {
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

    //cost to create [WORK, CARRY, MOVE] is 200 energy - the largest a creep can be is 50 parts - stop at 45
    let maxPartsBlockPerCreep = Math.min(Math.floor(energyCapacity / 200), 15);

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
        },
    };

    let minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE];

    let result = spawn.spawnCreep(minerBody, `${options.memory.role} ${Game.time}`, options);
    if (result === OK) {
        spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
    } else if (result === ERR_NOT_ENOUGH_ENERGY && spawn.room.storage?.store[RESOURCE_ENERGY] < 1000) {
        let emergencyMinerBody = [WORK, WORK, MOVE, MOVE];
        result = spawn.spawnCreep(emergencyMinerBody, `${options.memory.role} ${Game.time}`, options);
        if (result === OK) {
            spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
        }
    }
}

export function createPartsArray(partsBlock: BodyPartConstant[], energyCapacityAvailable: number, levelCap: number = 15): BodyPartConstant[] {
    let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
    let partsArray = [];

    for (let i = 0; i < Math.floor(energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length < 50 && i < levelCap; i++) {
        partsArray = partsArray.concat(partsBlock);
    }

    return partsArray;
}

function checkForSpawnAssignments(room: Room) {
    return Memory.empire.spawnAssignments.find((assignment) => assignment.designee === room.name);
}

function spawnAssignedCreep(spawn: StructureSpawn) {
    const ASSIGNMENT_INDEX = Memory.empire.spawnAssignments.findIndex((assignment) => assignment.designee === spawn.room.name);
    let assignment = Memory.empire.spawnAssignments[ASSIGNMENT_INDEX];
    let options: SpawnOptions = {
        memory: {
            ...assignment.memoryOptions,
        },
    };

    let result = spawn.spawnCreep(assignment.body, `${options.memory.role} ${Game.time}`, options);
    if (result === OK) {
        Memory.empire.spawnAssignments.splice(ASSIGNMENT_INDEX, 1);
    }
}

function getAdditionalUpgraderCount(room: Room): number {
    let storedEnergy = room.storage?.store[RESOURCE_ENERGY];

    if (storedEnergy > 400000) {
        return 2;
    } else if (storedEnergy > 200000) {
        return 1;
    }
    return 0;
}
