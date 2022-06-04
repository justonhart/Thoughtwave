import { posFromMem } from './memoryManagement';
import { PopulationManagement } from './populationManagement';
import { driveRemoteRoom } from './remoteRoomManagement';
import {
    findBunkerLocation,
    placeBunkerOuterRamparts,
    placeBunkerConstructionSites,
    placeMinerLinks,
    placeRoadsToPOIs,
    cleanRoom,
} from './roomDesign';

const BUILD_CHECK_PERIOD = 100;
const REPAIR_QUEUE_REFRESH_PERIOD = 500;

export function driveRoom(room: Room) {
    if (room.memory?.unclaim) {
        delete Memory.rooms[room.name];
        return;
    }

    // if room doesn't have memory, init room memory at appropriate stage
    if (!Memory.rooms[room.name].gates) {
        initRoom(room);
    }

    if (!room.canSpawn()) {
        // fail state - if a room has unexpectedly lost all spawns
        if (!Memory.empire.operations.find((op) => op.targetRoom === room.name && op.type === OperationType.COLONIZE)) {
        }
    } else {
        room.memory.reservedEnergy = 0;

        if (room.memory.repairSearchCooldown > 0) {
            room.memory.repairSearchCooldown--;
        }

        if (Game.time % REPAIR_QUEUE_REFRESH_PERIOD === 0) {
            room.memory.repairQueue = findRepairTargets(room);
        }

        if (room.memory.repairQueue.length) {
            room.memory.repairQueue.forEach((job) => {
                let pos = Game.getObjectById(job)?.pos;
                room.visual.text('🛠', pos);
            });
        }

        if (
            Game.time % BUILD_CHECK_PERIOD === 0 &&
            (room.energyStatus >= EnergyStatus.RECOVERING || room.energyStatus === undefined) &&
            Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES &&
            room.find(FIND_MY_CONSTRUCTION_SITES).length < 25
        ) {
            switch (room.controller.level) {
                case 8:
                case 7:
                case 6:
                case 5:
                    placeMinerLinks(room);
                case 4:
                    placeBunkerOuterRamparts(room);
                    placeMiningRamparts(room);
                case 3:
                    placeMiningPositionContainers(room);
                case 2:
                    placeBunkerConstructionSites(room);
                    placeRoadsToPOIs(room);
                case 1:
                    cleanRoom(room);
            }
        }

        runTowers(room);
        runHomeSecurity(room);
        driveRemoteRoom(room);

        if (room.memory.anchorPoint) {
            let anchorPoint = posFromMem(room.memory.anchorPoint);
            if (
                anchorPoint
                    .findInRange(FIND_HOSTILE_CREEPS, 6)
                    .some(
                        (creep) =>
                            creep.owner.username !== 'Invader' &&
                            (creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK))
                    )
            ) {
                room.controller.activateSafeMode();
            }
        }

        if (room.memory.gates?.length) {
            runGates(room);
        }

        runSpawning(room);

        delete room.memory.reservedEnergy;
    }
}

function runTowers(room: Room) {
    // @ts-ignore
    let towers: StructureTower[] = room.find(FIND_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_TOWER);

    let hostileCreeps = room.find(FIND_HOSTILE_CREEPS);

    let healers = hostileCreeps.filter((creep) => creep.getActiveBodyparts(HEAL) > 0);

    healers.length
        ? towers.forEach((tower) => tower.attack(tower.pos.findClosestByRange(healers)))
        : towers.forEach((tower) => tower.attack(tower.pos.findClosestByRange(hostileCreeps)));
}

function runHomeSecurity(homeRoom: Room) {
    const hostileCreeps = homeRoom.find(FIND_HOSTILE_CREEPS);
    let minNumHostileCreeps = homeRoom.controller.level < 4 ? 1 : 2;

    if (hostileCreeps.length >= minNumHostileCreeps) {
        if (PopulationManagement.needsProtector(homeRoom.name)) {
            const body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], homeRoom.energyCapacityAvailable - 300, 24);
            body.push(MOVE, HEAL);
            Memory.empire.spawnAssignments.push({
                designee: homeRoom.name,
                body: body,
                memoryOptions: {
                    role: Role.PROTECTOR,
                    room: homeRoom.name,
                    assignment: homeRoom.name,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { flee: false },
                },
            });
        } else if (hostileCreeps.length >= 4 && PopulationManagement.needsMeleeProtector(homeRoom.name)) {
            console.log(`Enemy Squad in homeRoom ${homeRoom.name}`);
            // Against squads we need two units (ranged for spread out dmg and melee for single target damage)
            const body = PopulationManagement.createPartsArray([ATTACK, MOVE], homeRoom.energyCapacityAvailable, 25);
            Memory.empire.spawnAssignments.push({
                designee: homeRoom.name,
                body: body,
                memoryOptions: {
                    role: Role.PROTECTOR,
                    room: homeRoom.name,
                    assignment: homeRoom.name,
                    currentTaskPriority: Priority.HIGH,
                    combat: { flee: false },
                },
            });
        }
    }
}

export function initRoom(room: Room) {
    let miningPostitions = findMiningPostitions(room);

    if (!miningPostitions) {
        return;
    }

    Memory.rooms[room.name] = {
        gates: [],
        repairSearchCooldown: 0,
        repairQueue: [],
        miningAssignments: {},
        remoteAssignments: {},
    };

    miningPostitions.forEach((pos) => {
        room.memory.miningAssignments[pos.toMemSafe()] = AssignmentStatus.UNASSIGNED;
    });

    //calculate room layout here
    let anchorPoint = findBunkerLocation(room);

    if (anchorPoint) {
        room.memory.layout = RoomLayout.BUNKER;
        room.memory.anchorPoint = anchorPoint.toMemSafe();
        room.createConstructionSite(anchorPoint.x, anchorPoint.y - 1, STRUCTURE_SPAWN);
    }
}

function findMiningPostitions(room: Room) {
    let sources = room.find(FIND_SOURCES);
    let miningPositions = new Set<RoomPosition>();
    sources.forEach((source) => {
        let possiblePositions = room
            .lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
            .filter((terrain) => terrain.terrain != 'wall')
            .map((terrain) => new RoomPosition(terrain.x, terrain.y, source.room.name));

        //set closest position to storage as container position
        let anchorPoint = posFromMem(room.memory.anchorPoint);
        let referencePos = anchorPoint ? new RoomPosition(anchorPoint.x + 1, anchorPoint.y - 1, room.name) : room.controller.pos;
        let candidate = referencePos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
        if (candidate) {
            miningPositions.add(candidate);
        }
    });

    // if a unique mining position was found for each source
    if (miningPositions.size === sources.length) {
        return Array.from(miningPositions);
    }

    return undefined;
}

function runSpawning(room: Room) {
    let spawns = Object.values(Game.spawns).filter((spawn) => spawn.room === room);

    let busySpawns = spawns.filter((spawn) => spawn.spawning);

    busySpawns.forEach((spawn) => {
        if (spawn.spawning.remainingTime <= 0) {
            let blockingCreeps = spawn.pos
                .findInRange(FIND_MY_CREEPS, 1)
                .filter(
                    (creep) => creep.memory.role !== Role.MANAGER && (!creep.memory.targetId || creep.memory.currentTaskPriority <= Priority.HIGH)
                );
            blockingCreeps.forEach((blocker) => {
                blocker.travelTo(spawn, { flee: true, range: 2 });
            });
        }
    });

    let availableSpawns = spawns.filter((spawn) => !spawn.spawning);

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
    let distributor = roomCreeps.find((creep) => creep.memory.role === Role.DISTRIBUTOR);
    let workerCount = roomCreeps.filter((creep) => creep.memory.role === Role.WORKER).length;
    let roomContainsViolentHostiles =
        room.find(FIND_HOSTILE_CREEPS).filter((creep) => creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK)).length > 0;

    if (distributor === undefined) {
        let spawn = availableSpawns.pop();
        spawn?.spawnDistributor();
    } else if (distributor.ticksToLive < 100) {
        //reserve energy & spawn for distributor
        availableSpawns.pop();
        room.memory.reservedEnergy += PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], room.energyCapacityAvailable, 10)
            .map((part) => BODYPART_COST[part])
            .reduce((sum, next) => sum + next);
    }

    if (PopulationManagement.needsTransporter(room) && !roomContainsViolentHostiles) {
        let options: SpawnOptions = {
            memory: {
                room: room.name,
                role: Role.TRANSPORTER,
            },
        };
        let spawn = availableSpawns.pop();
        spawn?.spawnMax([CARRY, CARRY, MOVE], PopulationManagement.getCreepTag('t', spawn.name), options, 10);
    }

    if (PopulationManagement.needsMiner(room) && !roomContainsViolentHostiles) {
        let spawn = availableSpawns.pop();
        spawn?.spawnMiner();
    }

    if (PopulationManagement.needsManager(room)) {
        if (room.memory.layout !== undefined) {
            let suitableSpawn = availableSpawns.find((spawn) => spawn.pos.isNearTo(posFromMem(room.memory.anchorPoint)));
            if (suitableSpawn) {
                suitableSpawn.spawnManager();
                availableSpawns = availableSpawns.filter((spawn) => spawn !== suitableSpawn);
            }
        } else {
            let spawn = availableSpawns.pop();
            spawn?.spawnManager();
        }
    }

    if (workerCount >= room.workerCapacity || roomContainsViolentHostiles) {
        let assigments = Memory.empire.spawnAssignments.filter((assignment) => assignment.designee === room.name);
        assigments.forEach((assignment) => {
            let canSpawnAssignment = room.energyAvailable >= assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
            if (canSpawnAssignment) {
                let spawn = availableSpawns.pop();
                spawn?.spawnAssignedCreep(assignment);
            }
        });

        if (room.energyStatus >= EnergyStatus.RECOVERING && Object.keys(room.memory.remoteAssignments).length && !roomContainsViolentHostiles) {
            if (PopulationManagement.needsRemoteMiner(room)) {
                let spawn = availableSpawns.pop();
                spawn?.spawnRemoteMiner();
            }

            if (PopulationManagement.needsGatherer(room)) {
                let spawn = availableSpawns.pop();
                spawn?.spawnGatherer();
            }

            if (PopulationManagement.needsReserver(room)) {
                let spawn = availableSpawns.pop();
                spawn?.spawnReserver();
            }
        }

        // TODO remove set room and put in function
        if (
            Game.time % 8000 === 0 &&
            !Memory.empire.spawnAssignments.filter((creep) => creep.memoryOptions.role === Role.SCOUT && creep.designee === room.name).length
        ) {
            Memory.empire.spawnAssignments.push({
                designee: room.name,
                body: [MOVE],
                memoryOptions: {
                    role: Role.SCOUT,
                    room: room.name,
                },
            });
        }
    }

    availableSpawns.forEach((spawn) => spawn.spawnWorker());
}

export function findRepairTargets(room: Room): Id<Structure>[] {
    if (!room.memory.repairQueue) {
        room.memory.repairQueue = [];
    }

    let repairTargetQueue: Id<Structure>[] = [];

    let damagedRoomStructures = room
        .find(FIND_STRUCTURES)
        .filter(
            (structure) =>
                structure.structureType !== STRUCTURE_WALL &&
                structure.structureType !== STRUCTURE_RAMPART &&
                structure.hits < (structure.structureType === STRUCTURE_ROAD ? structure.hitsMax * 0.9 : structure.hitsMax)
        );

    damagedRoomStructures.sort((structureA, structureB) => structureA.hits / structureA.hitsMax - structureB.hits / structureB.hitsMax);
    damagedRoomStructures.forEach((structure) => {
        repairTargetQueue.push(structure.id);
    });

    return repairTargetQueue;
}

function runGates(room: Room): void {
    let gates = room.memory.gates.filter((gate) => Game.getObjectById(gate.id));

    gates.forEach((gateId) => {
        if (gateId.lastToggled === undefined) {
            gateId.lastToggled = Game.time - 5;
        }

        let gate = Game.getObjectById(gateId.id);
        let creepsInRange = gate.pos.findInRange(FIND_HOSTILE_CREEPS, 1).length > 0;

        if (gate.isPublic && creepsInRange) {
            gate.setPublic(false);
            gateId.lastToggled = Game.time;
        } else if (!gate.isPublic && !creepsInRange && Game.time - gateId.lastToggled > 3) {
            gate.setPublic(true);
        }
    });

    room.memory.gates = gates;
}
function placeMiningPositionContainers(room: Room) {
    let miningPositions = Object.keys(room.memory.miningAssignments).map((pos) => posFromMem(pos));
    miningPositions.forEach((pos) => {
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
    });
}
function placeMiningRamparts(room: Room) {
    let miningPositions = Object.keys(room.memory.miningAssignments).map((pos) => posFromMem(pos));
    miningPositions.forEach((pos) => {
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_RAMPART);
    });
}
