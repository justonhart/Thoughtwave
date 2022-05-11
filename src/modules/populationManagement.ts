import { posFromMem } from './memoryManagement';

export class PopulationManagement {
    // function to calculate how many creeps a room can support
    static calculateEarlyCreepCapacity(room: Room): number {
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

    static spawnEarlyWorker(spawn: StructureSpawn): ScreepsReturnCode {
        const SPAWN_LIMIT = this.calculateEarlyCreepCapacity(spawn.room);
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

        let tag: string;
        const PARTS = [WORK, CARRY, MOVE];

        if (roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length < WORKER_LIMIT) {
            options.memory.role = Role.WORKER;
            tag = 'w';
        } else if (
            roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < UPGRADER_LIMIT &&
            !spawn.room.controller.upgradeBlocked
        ) {
            options.memory.role = Role.UPGRADER;
            tag = 'u';
        } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < MAINTAINTER_LIMIT) {
            options.memory.role = Role.MAINTAINTER;
            tag = 'm';
        } else if (
            roomCreeps.filter((creep) => creep.memory.role === Role.BUILDER).length < BUILDER_LIMIT &&
            spawn.room.find(FIND_MY_CONSTRUCTION_SITES).length
        ) {
            options.memory.role = Role.BUILDER;
            tag = 'b';
        }

        if (options.memory.role) {
            let result = spawn.spawnMax(PARTS, this.getCreepTag(tag, spawn.name), options);

            if (result === ERR_NOT_ENOUGH_ENERGY && !roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length) {
                spawn.spawnFirst(PARTS, this.getCreepTag(tag, spawn.name), options);
            }

            return result;
        }
    }

    static spawnPhaseTwoWorker(spawn: StructureSpawn): ScreepsReturnCode {
        const WORKER_CAPACITY = this.calculateWorkerCapacity(spawn.room);

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
                upgraderLimit = WORKER_CAPACITY - 1 + this.getAdditionalUpgraderCount(spawn.room);
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
        let creepLevelCap = 15;
        let tag: string;
        if (
            roomCreeps.filter((creep) => creep.memory.role === Role.BUILDER).length < builderLimit &&
            spawn.room.find(FIND_MY_CONSTRUCTION_SITES).length
        ) {
            options.memory.role = Role.BUILDER;
            tag = 'b';
        } else if (roomCreeps.filter((creep) => creep.memory.role === Role.UPGRADER).length < upgraderLimit) {
            options.memory.role = Role.UPGRADER;
            tag = 'u';
        } else if (roomCreeps.filter((creep) => creep.memory.role === Role.MAINTAINTER).length < maintainerLimit) {
            options.memory.role = Role.MAINTAINTER;
            creepLevelCap = creepLevelCap / 2;
            tag = 'ma';
        }

        if (options.memory.role) {
            let result = spawn.spawnMax(WORKER_PART_BLOCK, this.getCreepTag(tag, spawn.name), options, creepLevelCap);

            return result;
        }
    }

    //find the number of workers a phase-two room can support
    static calculateWorkerCapacity(room: Room): number {
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

    static needsMiner(room: Room): boolean {
        let roomNeedsMiner = Object.values(room.memory.miningAssignments).some((assignment) => assignment === AssignmentStatus.UNASSIGNED);

        return roomNeedsMiner;
    }

    static spawnMiner(spawn: StructureSpawn): ScreepsReturnCode {
        let assigmentKeys = Object.keys(spawn.room.memory.miningAssignments);
        let assigment = assigmentKeys.find((pos) => spawn.room.memory.miningAssignments[pos] === AssignmentStatus.UNASSIGNED);

        let options: SpawnOptions = {
            memory: {
                assignment: assigment,
                room: spawn.room.name,
                role: Role.MINER,
            },
        };

        let tag = 'm';

        let minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE];

        let result = spawn.smartSpawn(minerBody, this.getCreepTag(tag, spawn.name), options);
        if (result === OK) {
            spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
        } else if (result === ERR_NOT_ENOUGH_ENERGY && spawn.room.storage?.store[RESOURCE_ENERGY] < 1000) {
            let emergencyMinerBody = [WORK, WORK, MOVE, MOVE];
            result = spawn.smartSpawn(emergencyMinerBody, this.getCreepTag(tag, spawn.name), options);
            if (result === OK) {
                spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
            }
        }

        return result;
    }

    static needsRemoteMiner(room: Room): boolean {
        // TODO: remove this (where does memory get reinitialized?)
        if (!room.memory.remoteAssignments) {
            room.memory.remoteAssignments = {};
        }

        const assigmentKeys = Object.keys(room.memory.remoteAssignments);
        return !!assigmentKeys.find((remoteRoom) =>
            Object.values(room.memory.remoteAssignments[remoteRoom].miners).some((assignment) => assignment === AssignmentStatus.UNASSIGNED)
        );
    }

    static spawnRemoteMiner(spawn: StructureSpawn): ScreepsReturnCode {
        const remoteRooms = Object.keys(spawn.room.memory.remoteAssignments);
        const assigmentKey = remoteRooms.find((remoteRoom) =>
            Object.values(spawn.room.memory.remoteAssignments[remoteRoom].miners).some((assignment) => assignment === AssignmentStatus.UNASSIGNED)
        );
        const assignment = Object.keys(spawn.room.memory.remoteAssignments[assigmentKey].miners).find(
            (assignment) => spawn.room.memory.remoteAssignments[assigmentKey].miners[assignment] === AssignmentStatus.UNASSIGNED
        );

        let options: SpawnOptions = {
            memory: {
                assignment: assignment,
                room: spawn.room.name,
                role: Role.REMOTE_MINER,
                currentTaskPriority: Priority.HIGH,
            },
        };

        let tag = 'rm';

        let minerBody = [WORK, WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE, MOVE];

        let result = spawn.smartSpawn(minerBody, this.getCreepTag(tag, spawn.name), options);
        if (result === OK) {
            spawn.room.memory.remoteAssignments[posFromMem(assignment).roomName].miners[assignment] = AssignmentStatus.ASSIGNED;
        } else if (result === ERR_NOT_ENOUGH_ENERGY && spawn.room.storage?.store[RESOURCE_ENERGY] < 1000) {
            let emergencyMinerBody = [WORK, WORK, MOVE, MOVE];
            result = spawn.smartSpawn(emergencyMinerBody, this.getCreepTag(tag, spawn.name), options);
            if (result === OK) {
                spawn.room.memory.remoteAssignments[posFromMem(assignment).roomName].miners[assignment] = AssignmentStatus.ASSIGNED;
            }
        }

        return result;
    }

    static needsGatherer(room: Room): boolean {
        return Object.entries(room.memory.remoteAssignments).some(
            ([roomName, assignment]) =>
                assignment.gatherer === AssignmentStatus.UNASSIGNED ||
                (assignment.energyStatus === EnergyStatus.SURPLUS &&
                    Object.values(Memory.creeps).filter(
                        (creep) => creep.room === room.name && creep.role === Role.GATHERER && creep.assignment === roomName
                    ).length === 1)
        );
    }

    static spawnGatherer(spawn: StructureSpawn): ScreepsReturnCode {
        let assignmentKeys = Object.keys(spawn.room.memory.remoteAssignments);
        let assignment = assignmentKeys.find(
            (roomName) =>
                spawn.room.memory.remoteAssignments[roomName].gatherer === AssignmentStatus.UNASSIGNED ||
                (spawn.room.memory.remoteAssignments[roomName].energyStatus === EnergyStatus.SURPLUS &&
                    Object.values(Memory.creeps).filter(
                        (creep) => creep.room === spawn.room.name && creep.role === Role.GATHERER && creep.assignment === roomName
                    ).length === 1)
        );

        let options: SpawnOptions = {
            memory: {
                assignment: assignment,
                room: spawn.room.name,
                role: Role.GATHERER,
            },
        };

        let tag = 'g';

        let maxLevel = 12;
        let PARTS = PopulationManagement.createPartsArray([CARRY, WORK, MOVE, MOVE], spawn.room.energyCapacityAvailable, maxLevel);
        if (!Memory.rooms[spawn.room.name].remoteAssignments[assignment].needsConstruction) {
            if (Object.keys(Memory.rooms[spawn.room.name].remoteAssignments[assignment].miners).length == 1) {
                maxLevel = 8; // Rooms with only one source
            }
            PARTS = PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], spawn.room.energyCapacityAvailable - 150, maxLevel);
            PARTS.push(CARRY, WORK, MOVE); // One WORK so creep can repair
        }
        let result = spawn.spawnMax(PARTS, this.getCreepTag(tag, spawn.name), options, maxLevel);

        if (result === ERR_NOT_ENOUGH_ENERGY) {
            result = spawn.spawnFirst(PARTS, this.getCreepTag(tag, spawn.name), options, maxLevel);
        }

        if (result === OK) {
            spawn.room.memory.remoteAssignments[assignment].gatherer = AssignmentStatus.ASSIGNED;
        }

        return result;
    }

    static needsReserver(room: Room): boolean {
        return Object.values(room.memory.remoteAssignments).some((assignment) => assignment.reserver === AssignmentStatus.UNASSIGNED);
    }

    static spawnReserver(spawn: StructureSpawn): ScreepsReturnCode {
        let assigmentKeys = Object.keys(spawn.room.memory.remoteAssignments);
        let assigment = assigmentKeys.find((roomName) => spawn.room.memory.remoteAssignments[roomName].reserver === AssignmentStatus.UNASSIGNED);

        let options: SpawnOptions = {
            memory: {
                assignment: assigment,
                room: spawn.room.name,
                role: Role.RESERVER,
            },
        };

        let tag = 'rs';

        let maxSize = 2;
        if (spawn.room.memory.remoteAssignments[assigment].controllerState === RemoteMiningRoomControllerState.STABLE) {
            maxSize = 1;
        }

        const PARTS = [CLAIM, MOVE];
        let result = spawn.spawnMax(PARTS, this.getCreepTag(tag, spawn.name), options, maxSize);

        if (result === OK) {
            spawn.room.memory.remoteAssignments[assigment].reserver = AssignmentStatus.ASSIGNED;
        }

        return result;
    }

    static createPartsArray(partsBlock: BodyPartConstant[], energyCapacityAvailable: number, levelCap: number = 15): BodyPartConstant[] {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (let i = 0; i < Math.floor(energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length < 50 && i < levelCap; i++) {
            partsArray = partsArray.concat(partsBlock);
        }

        return partsArray;
    }

    static spawnAssignedCreep(spawn: StructureSpawn, assignment: SpawnAssignment): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                ...assignment.memoryOptions,
            },
        };

        let result = spawn.smartSpawn(assignment.body, this.getCreepTag('s', spawn.name), options);
        if (result === OK) {
            const ASSIGNMENT_INDEX = Memory.empire.spawnAssignments.findIndex((a) => a === assignment);
            Memory.empire.spawnAssignments.splice(ASSIGNMENT_INDEX, 1);
        }

        return result;
    }

    static spawnDistributor(spawn: StructureSpawn): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.DISTRIBUTOR,
            },
        };

        const PARTS = [CARRY, CARRY, MOVE];
        let result = spawn.spawnMax(PARTS, this.getCreepTag('d', spawn.name), options, 10);

        if (result === ERR_NOT_ENOUGH_ENERGY) {
            result = spawn.spawnFirst(PARTS, this.getCreepTag('d', spawn.name), options, 10);
        }

        return result;
    }

    static getAdditionalUpgraderCount(room: Room): number {
        let storedEnergy = room.storage?.store[RESOURCE_ENERGY];

        if (storedEnergy > 400000) {
            return 2;
        } else if (storedEnergy > 200000) {
            return 1;
        }
        return 0;
    }

    static getCreepTag(tag: string, spawnName: string): string {
        return tag + Game.shard.name.slice(-1) + spawnName.substring(5) + Game.time.toString().slice(-4);
    }

    // spawn the largest creep possible as calculated with spawn.energyAvailable
    static spawnFirst(
        spawn: StructureSpawn,
        partsBlock: BodyPartConstant[],
        name: string,
        opts?: SpawnOptions,
        levelCap: number = 15
    ): ScreepsReturnCode {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (
            let i = 0;
            i < Math.floor((spawn.room.energyAvailable - (spawn.room.memory.reservedEnergy ?? 0)) / partsBlockCost) &&
            (i + 1) * partsBlock.length < 50 &&
            i < levelCap;
            i++
        ) {
            partsArray = partsArray.concat(partsBlock);
        }

        if (!partsArray.length) {
            return ERR_NOT_ENOUGH_ENERGY;
        }

        return spawn.smartSpawn(partsArray, name, opts);
    }

    // spawn the largest creep possible as calculated with spawn.energyCapacityAvailable
    static spawnMax(
        spawn: StructureSpawn,
        partsBlock: BodyPartConstant[],
        name: string,
        opts?: SpawnOptions,
        levelCap: number = 15
    ): ScreepsReturnCode {
        let partsBlockCost = partsBlock.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost);
        let partsArray = [];

        for (
            let i = 0;
            i < Math.floor(spawn.room.energyCapacityAvailable / partsBlockCost) && (i + 1) * partsBlock.length < 50 && i < levelCap;
            i++
        ) {
            partsArray = partsArray.concat(partsBlock);
        }

        return spawn.smartSpawn(partsArray, name, opts);
    }
}
