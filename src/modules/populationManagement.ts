import { posFromMem } from './memoryManagement';

export class PopulationManagement {
    static spawnWorker(spawn: StructureSpawn): ScreepsReturnCode {
        const WORKER_CAPACITY = this.calculateWorkerCapacity(spawn.room);

        let limit: number;

        switch (spawn.room.energyStatus) {
            case EnergyStatus.CRITICAL:
                limit = 0;
                break;
            case EnergyStatus.RECOVERING:
                limit = 1;
                break;
            default:
            case EnergyStatus.STABLE:
                limit = WORKER_CAPACITY;
                break;
            case EnergyStatus.SURPLUS:
                limit = WORKER_CAPACITY + 1;
                break;
        }

        let workers = Object.values(Game.creeps).filter((creep) => creep.memory.room === spawn.room.name && creep.memory.role === Role.WORKER);

        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.WORKER,
            },
        };

        const WORKER_PART_BLOCK = [WORK, CARRY, MOVE];
        let creepLevelCap = 15;
        let tag = 'w';
        if (workers.length < limit) {
            let result = spawn.spawnMax(WORKER_PART_BLOCK, this.getCreepTag(tag, spawn.name), options, creepLevelCap);
            return result;
        } else {
            //check to see if there are any creeps to replace w/ stronger models
            let maxSize = this.createPartsArray(WORKER_PART_BLOCK, spawn.room.energyCapacityAvailable, creepLevelCap).length;
            let creepToReplace = workers.find((creep) => creep.getActiveBodyparts(WORK) < maxSize / 3);
            if (creepToReplace) {
                let result = spawn.spawnMax(WORKER_PART_BLOCK, this.getCreepTag(tag, spawn.name), options, creepLevelCap);
                if (result === OK) {
                    creepToReplace.suicide();
                }
                return result;
            }
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

        let creepCapacity = Math.min(totalIncomePerCycle / energyExpenditurePerCyclePerCreep, sourceCount * 2);

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
        let minerBody: ('work' | 'move' | 'carry')[];

        if (spawn.room.energyCapacityAvailable >= 650) {
            minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE];
        } else if (spawn.room.energyCapacityAvailable >= 550) {
            minerBody = [WORK, WORK, WORK, WORK, WORK, MOVE];
        } else if (spawn.room.energyCapacityAvailable >= 450) {
            minerBody = [WORK, WORK, WORK, WORK, MOVE];
        } else if (spawn.room.energyCapacityAvailable >= 350) {
            minerBody = [WORK, WORK, WORK, MOVE];
        } else {
            minerBody = [WORK, WORK, MOVE];
        }

        let assigmentPos = posFromMem(assigment);
        let link = assigmentPos.findInRange(FIND_MY_STRUCTURES, 1).find((s) => s.structureType === STRUCTURE_LINK);
        if (link) {
            //@ts-expect-error
            options.memory.link = link.id;
            minerBody.unshift(CARRY);
        }

        let result = spawn.smartSpawn(minerBody, this.getCreepTag(tag, spawn.name), options);
        if (result === OK) {
            spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
        } else if (result === ERR_NOT_ENOUGH_ENERGY && (!spawn.room.storage || spawn.room.storage?.store[RESOURCE_ENERGY] < 1000)) {
            let emergencyMinerBody = [WORK, WORK, MOVE];
            result = spawn.smartSpawn(emergencyMinerBody, this.getCreepTag(tag, spawn.name), options);
            if (result === OK) {
                spawn.room.memory.miningAssignments[assigment] = AssignmentStatus.ASSIGNED;
            }
        }

        return result;
    }

    static needsRemoteMiner(room: Room): boolean {
        const assigmentKeys = Object.keys(room.memory.remoteAssignments);
        return !!assigmentKeys.find(
            (remoteRoom) =>
                room.memory.remoteAssignments[remoteRoom].state !== RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS &&
                room.memory.remoteAssignments[remoteRoom].controllerState !== RemoteMiningRoomControllerState.ENEMY &&
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
                assignment.state !== RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS &&
                assignment.controllerState !== RemoteMiningRoomControllerState.ENEMY &&
                (assignment.gatherer === AssignmentStatus.UNASSIGNED ||
                    (assignment.energyStatus === EnergyStatus.SURPLUS &&
                        Object.values(Memory.creeps).filter(
                            (creep) => creep.room === room.name && creep.role === Role.GATHERER && creep.assignment === roomName
                        ).length === 1))
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

        let maxLevel = 15;
        let PARTS = PopulationManagement.createPartsArray([CARRY, WORK, MOVE, MOVE], spawn.room.energyCapacityAvailable, maxLevel);
        if (!Memory.rooms[spawn.room.name].remoteAssignments[assignment].needsConstruction) {
            if (Object.keys(Memory.rooms[spawn.room.name].remoteAssignments[assignment].miners).length == 1) {
                maxLevel = 8; // Rooms with only one source
            }
            PARTS = PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], spawn.room.energyCapacityAvailable - 200, maxLevel);
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
        return Object.values(room.memory.remoteAssignments).some(
            (assignment) => assignment.state !== RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS && assignment.reserver === AssignmentStatus.UNASSIGNED
        );
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

    static smartSpawn(spawn: StructureSpawn, body: BodyPartConstant[], name: string, opts?: SpawnOptions) {
        let partsArrayCost = body.length ? body.map((part) => BODYPART_COST[part]).reduce((sum, partCost) => sum + partCost) : 0;

        if (partsArrayCost - (spawn.room.memory.reservedEnergy ?? 0) > spawn.room.energyAvailable) {
            return ERR_NOT_ENOUGH_ENERGY;
        }

        // find safe spawn direction in predefined layouts
        if (spawn.room.memory?.layout === RoomLayout.BUNKER) {
            if (!opts.directions) {
                let anchorPoint = posFromMem(spawn.room.memory.anchorPoint);

                if (spawn.pos.x - anchorPoint.x === 0) {
                    opts.directions = [TOP_LEFT, TOP_RIGHT];
                } else if (spawn.pos.x - anchorPoint.x === -1) {
                    opts.directions = [TOP_LEFT, TOP, LEFT];
                } else if (spawn.pos.x - anchorPoint.x === 2) {
                    opts.directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM];
                }
            }
        }

        let result = spawn.spawnCreep(body, name, opts);

        if (result !== OK) {
            console.log(`Unexpected result from smartSpawn in spawn ${spawn.name}: ${result} - body: ${body} - opts: ${JSON.stringify(opts)}`);
        }

        return result;
    }

    static spawnManager(spawn: StructureSpawn): ScreepsReturnCode {
        let options: SpawnOptions = {
            memory: {
                room: spawn.room.name,
                role: Role.MANAGER,
                currentTaskPriority: Priority.HIGH,
            },
        };

        let immobile = false;

        if (spawn.room.memory?.layout === RoomLayout.BUNKER) {
            let anchorPoint = posFromMem(spawn.room.memory.anchorPoint);

            if (spawn.pos.x - anchorPoint.x === 0) {
                options.directions = [BOTTOM];
            } else if (spawn.pos.x - anchorPoint.x === -1) {
                options.directions = [BOTTOM_RIGHT];
            }

            immobile = true;
        }

        let name = this.getCreepTag('mg', spawn.name);

        if (immobile) {
            return spawn.spawnMax([CARRY, CARRY], name, options, 8);
        } else {
            let body = this.createPartsArray([CARRY, CARRY], spawn.room.energyCapacityAvailable, 8).concat([MOVE]);
            return spawn.smartSpawn(body, name, options);
        }
    }

    static needsManager(room: Room): boolean {
        let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
        let manager = roomCreeps.find((creep) => creep.memory.role === Role.MANAGER);
        return room.controller?.level >= 5 && (room.memory.layout !== undefined || !!room.memory.managerPos) && !manager;
    }

    static needsProtector(roomName: string): boolean {
        return (
            !Object.values(Game.creeps).filter(
                (creep) => creep.memory.role === Role.PROTECTOR && (creep.memory.assignment === roomName || creep.pos.roomName === roomName)
            ).length &&
            !Memory.empire.spawnAssignments.filter(
                (creep) => creep.memoryOptions.role === Role.PROTECTOR && creep.memoryOptions.assignment === roomName
            ).length
        );
    }
}
