import { CombatIntel } from './combatIntel';
import { addVisionRequest } from './data';
import { Pathing } from './pathing';
import { PopulationManagement } from './populationManagement';
import { getSpawnPos, placeBunkerConstructionSites, roomNeedsCoreStructures } from './roomDesign';

const OPERATION_STARTING_STAGE_MAP: { [key in OperationType]?: OperationStage } = {
    [OperationType.COLONIZE]: OperationStage.CLAIM,
    [OperationType.STERILIZE]: OperationStage.ACTIVE,
    [OperationType.COLLECTION]: OperationStage.ACTIVE,
    [OperationType.SECURE]: OperationStage.ACTIVE,
    [OperationType.ROOM_RECOVERY]: OperationStage.ACTIVE,
    [OperationType.ATTACK]: OperationStage.ACTIVE,
    [OperationType.QUAD_ATTACK]: OperationStage.ACTIVE,
    [OperationType.UPGRADE_BOOST]: OperationStage.ACTIVE,
    [OperationType.REMOTE_BUILD]: OperationStage.ACTIVE,
    [OperationType.CLEAN]: OperationStage.ACTIVE,
    [OperationType.POWER_BANK]: OperationStage.PREPARE,
};

const OPERATOR_PARTS_MAP: { [key in OperationType]?: BodyPartConstant[] } = {
    [OperationType.CLEAN]: [WORK, MOVE],
    [OperationType.COLLECTION]: [CARRY, CARRY, MOVE],
    [OperationType.REMOTE_BUILD]: [WORK, CARRY, MOVE, MOVE],
    [OperationType.UPGRADE_BOOST]: [WORK, CARRY, MOVE, MOVE],
    [OperationType.STERILIZE]: [WORK, MOVE],
};

const OPERATION_BOOST_MAP: { [key in OperationType]?: BoostType[] } = {
    [OperationType.CLEAN]: [BoostType.DISMANTLE],
    [OperationType.COLLECTION]: [BoostType.CARRY],
    [OperationType.REMOTE_BUILD]: [BoostType.BUILD],
    [OperationType.UPGRADE_BOOST]: [BoostType.UPGRADE],
    [OperationType.STERILIZE]: [BoostType.DISMANTLE],
};

export function manageOperations() {
    Object.entries(Memory.operations).forEach(([operationId, operation]) => {
        if (operation.stage === OperationStage.COMPLETE) {
            if (Memory.debug.logOperations) {
                console.log(`Operation ${operationId} (Type: ${operation.type} targeting ${operation.targetRoom}) completed successfully`);
            }
            delete Memory.operations[operationId];
        } else if (operation.stage === OperationStage.FAILED) {
            if (Memory.debug.logOperations) {
                console.log(`Operation ${operationId} (Type: ${operation.type} targeting ${operation.targetRoom}) failed`);
            }
            delete Memory.operations[operationId];
        } else {
            try {
                switch (operation.type) {
                    case OperationType.COLONIZE:
                        manageColonizationOperation(operationId, operation);
                        break;
                    case OperationType.SECURE:
                        manageSecureRoomOperation(operationId, operation);
                        break;
                    case OperationType.ROOM_RECOVERY:
                        manageRoomRecoveryOperation(operationId, operation);
                        break;
                    case OperationType.ATTACK:
                        manageAttackRoomOperation(operationId, operation);
                        break;
                    case OperationType.QUAD_ATTACK:
                        manageQuadAttackRoomOperation(operationId, operation);
                        break;
                    case OperationType.POWER_BANK:
                        manageAddPowerBankOperation(operationId, operation);
                        break;
                    case OperationType.COLLECTION:
                    case OperationType.UPGRADE_BOOST:
                    case OperationType.REMOTE_BUILD:
                    case OperationType.STERILIZE:
                    case OperationType.CLEAN:
                        manageSimpleOperation(operationId, operation);
                        break;
                }
            } catch (e) {
                console.log(`Error caught in operation ${operationId} targeting ${operation.targetRoom}: \n${e}`);
            }
        }
    });
}

function manageColonizationOperation(opId: string, op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom)?.roomName;
    }

    switch (op.stage) {
        case OperationStage.CLAIM:
            let claimerExistsOrAssigned: boolean =
                Object.values(Memory.creeps).filter((creep) => creep.role === Role.CLAIMER && creep.destination === op.targetRoom).length +
                    Memory.spawnAssignments.filter(
                        (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.role === Role.CLAIMER
                    ).length >
                0;
            if (op.originRoom && !claimerExistsOrAssigned) {
                Memory.spawnAssignments.push({
                    designee: op.originRoom,
                    body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
                    spawnOpts: {
                        memory: {
                            role: Role.CLAIMER,
                            destination: op.targetRoom,
                            room: op.originRoom,
                            waypoints: op.waypoints,
                        },
                    },
                });
            }
            break;
        case OperationStage.BUILD:
            let miningAssignments = Object.keys(Memory.rooms[op.targetRoom]?.miningAssignments);
            miningAssignments.forEach((key) => {
                if (
                    Memory.rooms[op.targetRoom]?.miningAssignments?.[key] === AssignmentStatus.UNASSIGNED &&
                    !Memory.spawnAssignments.filter(
                        (creep) => creep.spawnOpts.memory.room === op.targetRoom && creep.spawnOpts.memory.assignment === key
                    ).length
                ) {
                    Memory.rooms[op.targetRoom].miningAssignments[key] = AssignmentStatus.ASSIGNED;
                    Memory.spawnAssignments.push({
                        designee: op.originRoom,
                        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
                        spawnOpts: {
                            memory: {
                                role: Role.MINER,
                                assignment: key,
                                room: op.targetRoom,
                                waypoints: op.waypoints,
                            },
                        },
                    });
                }
            });

            let numberOfColonizersFound =
                Object.values(Memory.creeps).filter((creep) => creep.role === Role.COLONIZER && creep.destination === op.targetRoom).length +
                Memory.spawnAssignments.filter(
                    (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.role === Role.COLONIZER
                ).length;
            if (op.originRoom && numberOfColonizersFound < 2) {
                Memory.spawnAssignments.push({
                    designee: op.originRoom,
                    body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
                    spawnOpts: {
                        memory: {
                            role: Role.COLONIZER,
                            destination: op.targetRoom,
                            waypoints: op.waypoints,
                        },
                    },
                });
            }
            break;
    }
}

export function findOperationOrigin(targetRoom: string, opts?: OriginOpts): OriginResult {
    let possibleSpawnRooms = Object.values(Game.rooms).filter(
        (room) =>
            room.controller?.my &&
            room.canSpawn() &&
            room.energyStatus >= (opts?.minEnergyStatus ?? EnergyStatus.RECOVERING) &&
            (!opts?.maxThreatLevel || room.memory.threatLevel <= opts.maxThreatLevel) &&
            (!opts?.operationCriteria ||
                Object.values(Memory.operations).filter(
                    (operation) =>
                        operation.originRoom === room.name &&
                        opts.operationCriteria.type === operation.type &&
                        (!opts.operationCriteria.stage || operation.stage <= opts.operationCriteria.stage)
                ).length < opts.operationCriteria.maxCount) &&
            Game.map.getRoomLinearDistance(room.name, targetRoom) <= (opts?.maxLinearDistance ?? 10) &&
            (opts?.minSpawnCount
                ? room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_SPAWN }).length >= opts.minSpawnCount
                : true) &&
            (opts?.needsBoost ? room.labs.length > 0 : true)
    );

    let bestRoom: OriginResult;

    let rooms = possibleSpawnRooms.map((room) => {
        const allowedRooms = Pathing.findRoute(room.name, targetRoom, { avoidHostileRooms: true });
        if (allowedRooms === ERR_NO_PATH) {
            return undefined;
        }
        return {
            name: room.name,
            path: PathFinder.search(
                room.controller?.pos,
                { pos: new RoomPosition(25, 25, targetRoom), range: 23 },
                {
                    maxRooms: 25,
                    swampCost: opts?.ignoreTerrain ? 1 : 5,
                    maxOps: 100000,
                    roomCallback(roomName) {
                        if (allowedRooms) {
                            if (!allowedRooms.includes(roomName)) {
                                return false;
                            }
                        }
                    },
                }
            ),
        };
    });
    rooms = rooms.filter((room) => !room.path.incomplete);

    if (rooms.length) {
        let closestRoom: { name: string; path: PathFinderPath };
        let highestLevel: number;
        switch (opts?.selectionCriteria) {
            case OriginCriteria.CLOSEST:
                closestRoom = rooms.reduce((best, next) => {
                    return next.path.cost <= best.path.cost ? next : best;
                });
                bestRoom = { roomName: closestRoom.name, cost: closestRoom.path.cost };
                break;
            case OriginCriteria.HIGHEST_LEVEL:
            default:
                highestLevel = Math.max(...rooms.map((room) => Game.rooms[room.name].controller.level));
                closestRoom = rooms
                    .filter((room) => Game.rooms[room.name].controller.level === highestLevel)
                    .reduce((best, next) => {
                        return next.path.cost <= best.path.cost ? next : best;
                    });
                bestRoom = { roomName: closestRoom.name, cost: closestRoom.path.cost };
        }
    }

    return bestRoom;
}

function manageSimpleOperation(opId: string, op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom)?.roomName;
    }

    const operatives = Object.values(Game.creeps).filter((c) => (c.memory.operationId = opId));

    if (op.originRoom && operatives.length < (op.operativeCount ?? 1)) {
        Memory.spawnAssignments.push({
            designee: op.originRoom,
            body: PopulationManagement.createPartsArray(OPERATOR_PARTS_MAP[op.type], Game.rooms[op.originRoom].energyCapacityAvailable),
            spawnOpts: {
                memory: {
                    role: Role.OPERATIVE,
                    operationId: opId,
                },
                boosts: OPERATION_BOOST_MAP[op.type],
            },
        });
    }
}

export function addOperation(operationType: OperationType, targetRoom: string, opts?: OperationOpts) {
    let originRoom = opts?.originRoom;
    delete opts?.originRoom;

    if (!originRoom) {
        const originResult = findOperationOrigin(opts?.portalLocations?.[0]?.toRoomPos()?.roomName ?? targetRoom, opts?.originOpts);
        originRoom = originResult?.roomName;
        if (!opts?.pathCost) {
            if (!opts) {
                opts = {};
            }
            opts.pathCost = originResult?.cost;
        }
        delete opts?.originOpts;
    }

    if (originRoom) {
        let newOp: Operation = {
            targetRoom: targetRoom,
            originRoom: originRoom,
            stage: OPERATION_STARTING_STAGE_MAP[operationType],
            type: operationType,
            visionRequests: [],
            ...opts,
        };

        const nextOperationId = `o${operationType}_${Game.time}_${global.identifierIncrement++}`;
        if (Memory.debug.logOperations) {
            console.log(`${originRoom} selected for operation ${nextOperationId}`);
        }

        Memory.operations[nextOperationId] = newOp;
    } else if (Memory.debug.logOperations) {
        console.log('No suitable origin found');
    }
}

function manageSecureRoomOperation(opId: string, op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        const operationResult = findOperationOrigin(op.targetRoom);
        op.originRoom = operationResult?.roomName;
        op.pathCost = operationResult?.cost;
    }

    const origin = Game.rooms[op.originRoom];

    const targetIsColonizeTarget = Object.values(Memory.operations).some(
        (otherOperation) => op.targetRoom === otherOperation.targetRoom && otherOperation.type === OperationType.COLONIZE
    );
    const bodyParts =
        targetIsColonizeTarget &&
        Game.rooms[op.targetRoom]?.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE }).length
            ? [ATTACK, MOVE]
            : [RANGED_ATTACK, MOVE];
    const body = PopulationManagement.createPartsArray(bodyParts, origin.energyCapacityAvailable - 300);
    body.push(HEAL, MOVE);

    let assignedProtectorCount =
        Object.values(Game.creeps).filter(
            (creep) =>
                creep.memory.assignment === op.targetRoom &&
                creep.memory.role === Role.PROTECTOR &&
                (creep.spawning || creep.ticksToLive > op.pathCost + body.length * 3)
        ).length +
        Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.assignment === op.targetRoom && creep.spawnOpts.memory.role === Role.PROTECTOR
        ).length;

    if (Game.rooms[op.originRoom] && assignedProtectorCount < op.operativeCount) {
        Memory.spawnAssignments.push({
            designee: op.originRoom,
            body: body,
            spawnOpts: {
                memory: {
                    role: Role.PROTECTOR,
                    assignment: op.targetRoom,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { flee: false },
                    room: op.targetRoom,
                    waypoints: op.waypoints,
                },
            },
        });
    }
}

function manageRoomRecoveryOperation(opId: string, op: Operation) {
    const targetRoom = Game.rooms[op.targetRoom];

    if (!targetRoom.find(FIND_MY_CONSTRUCTION_SITES).find((site) => site.structureType === STRUCTURE_SPAWN)) {
        let spawnPos = getSpawnPos(targetRoom);
        targetRoom.createConstructionSite(spawnPos, STRUCTURE_SPAWN);
    }

    let miningAssignments = Object.keys(Memory.rooms[op.targetRoom]?.miningAssignments);
    miningAssignments.forEach((key) => {
        if (
            Memory.rooms[op.targetRoom]?.miningAssignments?.[key] === AssignmentStatus.UNASSIGNED &&
            !Memory.spawnAssignments.filter((creep) => creep.spawnOpts.memory.room === op.targetRoom && creep.spawnOpts.memory.assignment === key)
                .length
        ) {
            Memory.rooms[op.targetRoom].miningAssignments[key] = AssignmentStatus.ASSIGNED;
            Memory.spawnAssignments.push({
                designee: op.originRoom,
                body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
                spawnOpts: {
                    memory: {
                        role: Role.MINER,
                        assignment: key,
                        room: op.targetRoom,
                        waypoints: op.waypoints,
                    },
                },
            });
        }
    });

    const numberOfRecoveryWorkers =
        Object.values(Memory.creeps).filter((creep) => creep.role === Role.WORKER && creep.room === op.targetRoom && creep.operationId === opId)
            .length +
        Memory.spawnAssignments.filter(
            (creep) =>
                creep.spawnOpts.memory.room === op.targetRoom &&
                creep.spawnOpts.memory.role === Role.WORKER &&
                creep.spawnOpts.memory.operationId === opId
        ).length;
    if (op.originRoom && numberOfRecoveryWorkers < (op.operativeCount ?? miningAssignments.length)) {
        Memory.spawnAssignments.push({
            designee: op.originRoom,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
            spawnOpts: {
                memory: {
                    role: Role.WORKER,
                    room: op.targetRoom,
                    operationId: opId,
                    waypoints: op.waypoints,
                },
            },
        });
    }

    if (targetRoom.memory.layout === RoomLayout.BUNKER && !roomNeedsCoreStructures(targetRoom)) {
        Memory.operations[opId].stage = OperationStage.COMPLETE;

        placeBunkerConstructionSites(targetRoom);
    } else if (targetRoom.memory.layout === RoomLayout.STAMP) {
        // Simply send one recovery squad
        targetRoom.memory.dontCheckConstructionsBefore = targetRoom.memory.dontCheckConstructionsBefore - 1000;
        Memory.operations[opId].stage = OperationStage.COMPLETE;
    }
}

function manageAttackRoomOperation(opId: string, op: Operation) {
    const originRoom = Game.rooms[op.originRoom];
    const attackerBody = PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
        sortByBodyPart(MOVE, bodyA, bodyB)
    );
    const healerBody = [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)];
    createSquad(op, SquadType.DUO, attackerBody, healerBody, [BoostType.DISMANTLE], [BoostType.HEAL]);
    Memory.operations[opId].stage = OperationStage.COMPLETE; // For now it will only spawn one set. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
}

function manageQuadAttackRoomOperation(opId: string, op: Operation) {
    const originRoom = Game.rooms[op.originRoom];
    const attackerBody = PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
        sortByBodyPart(MOVE, bodyA, bodyB)
    );
    const healerBody = [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)];
    createSquad(op, SquadType.QUAD, attackerBody, healerBody, [BoostType.DISMANTLE], [BoostType.HEAL]);
    Memory.operations[opId].stage = OperationStage.COMPLETE; // For now it will only spawn one set. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
}

function sortByBodyPart(prioritizedBodyPart: BodyPartConstant, bodyA: BodyPartConstant, bodyB: BodyPartConstant) {
    if (bodyA === prioritizedBodyPart && bodyB !== prioritizedBodyPart) {
        return 1;
    }
    if (bodyA !== prioritizedBodyPart && bodyB === prioritizedBodyPart) {
        return -1;
    }
    return 0;
}

export function launchIntershardParty(portalLocations: string[], destinationRoom: string) {
    let origin = findOperationOrigin(portalLocations[0].toRoomPos().roomName)?.roomName;

    console.log(`launching intershard from ${origin}`);

    Memory.spawnAssignments.push({
        designee: origin,
        body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
        spawnOpts: {
            memory: {
                role: Role.CLAIMER,
                waypoints: portalLocations,
                destination: destinationRoom,
            },
        },
    });

    Memory.spawnAssignments.push({
        designee: origin,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
        spawnOpts: {
            memory: {
                role: Role.INTERSHARD_TRAVELLER,
                nextRole: Role.MINER,
                destination: destinationRoom,
                waypoints: portalLocations,
            },
        },
    });

    Memory.spawnAssignments.push({
        designee: origin,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
        spawnOpts: {
            memory: {
                role: Role.INTERSHARD_TRAVELLER,
                nextRole: Role.MINER,
                destination: destinationRoom,
                waypoints: portalLocations,
            },
        },
    });

    Memory.spawnAssignments.push({
        designee: origin,
        body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
        spawnOpts: {
            memory: {
                role: Role.INTERSHARD_TRAVELLER,
                nextRole: Role.WORKER,
                destination: destinationRoom,
                waypoints: portalLocations,
            },
        },
    });

    Memory.spawnAssignments.push({
        designee: origin,
        body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
        spawnOpts: {
            memory: {
                role: Role.INTERSHARD_TRAVELLER,
                nextRole: Role.WORKER,
                destination: destinationRoom,
                waypoints: portalLocations,
            },
        },
    });
}

/**
 * Add a PowerBank Operation
 * Checks:
 *  - PowerBank is still present
 *  - Enough time before powerBank decays (time needed to destroy + travelCost)
 *  - Available homeroom in range
 * If PowerBank Operation is not doable for some reason, then set it to false to avoid calculating this again
 * @param op
 */
function manageAddPowerBankOperation(opId: string, op: Operation) {
    const targetRoom = Game.rooms[op.targetRoom];
    const originRoom = Game.rooms[op.originRoom];
    switch (op.stage) {
        case OperationStage.PREPARE:
            if (op.pathCost > 500) {
                Memory.roomData[op.targetRoom].powerBank = false;
                op.stage = OperationStage.COMPLETE;
                return;
            } else if (
                Object.values(Memory.operations).some(
                    (operation) => operation.type === OperationType.POWER_BANK && operation.originRoom === op.originRoom && operation.stage > 1
                )
            ) {
                op.stage = OperationStage.COMPLETE; // Do not set powerBank to false since other originRooms might be in range
                return;
            }
            if (targetRoom) {
                op.visionRequests = [];
                const powerBank = targetRoom
                    .find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_POWER_BANK })
                    .pop() as unknown as StructurePowerBank;
                if (powerBank && powerBank.ticksToDecay > 2500 && powerBank.power > 2000) {
                    const numFreeSpaces = Math.min(
                        targetRoom
                            .lookForAtArea(LOOK_TERRAIN, powerBank.pos.y - 1, powerBank.pos.x - 1, powerBank.pos.y + 1, powerBank.pos.x + 1, true)
                            .filter((lookPos) => lookPos.terrain !== 'wall').length,
                        4
                    );

                    // Avoid conflict
                    const hasEnemies = targetRoom
                        .find(FIND_HOSTILE_CREEPS)
                        .some((creep) => creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK));
                    // Don't bother getting powerbanks with only one space of access (could do that later but will have to boost healer/attacker)
                    if (numFreeSpaces > 1 && !hasEnemies) {
                        op.operativeCount = numFreeSpaces;
                        op.stage = OperationStage.ACTIVE;
                        return;
                    }
                }
                Memory.roomData[op.targetRoom].powerBank = false;
                op.stage = OperationStage.COMPLETE;
            } else if (!op.visionRequests?.some((id) => Memory.visionRequests[id])) {
                //add vision request
                let result = addVisionRequest({ targetRoom: op.targetRoom });
                if (result !== ERR_NOT_FOUND) {
                    op.visionRequests.push(result as string);
                }
            }
            break;
        case OperationStage.ACTIVE:
            // Alive or currently spawning squads
            const squads = Object.values(Memory.squads).filter(
                (squad) => squad.assignment === op.targetRoom && (!squad.members || squad.members[SquadMemberType.SQUAD_LEADER])
            );

            // If attackers are dying then abandon operation
            const squadLeaders = squads.filter((squad) => squad.members).map((squad) => Game.creeps[squad.members[SquadMemberType.SQUAD_LEADER]]);
            squadLeaders.forEach((squadLeader) => {
                if (squadLeader.hits < squadLeader.hitsMax / 2) {
                    // Recycle Creeps after destroying powerbank
                    Object.values(Memory.creeps)
                        .filter((creep) => creep.assignment === targetRoom.name || creep.destination === targetRoom.name)
                        .forEach((creep) => (creep.recycle = true));
                    Object.values(Memory.squads)
                        .filter((squad) => squad.assignment === targetRoom.name && squad.members)
                        .forEach((squad) => Object.values(squad.members).forEach((creepName) => (Memory.creeps[creepName].recycle = true)));
                    op.stage = OperationStage.COMPLETE;
                    return;
                }
            });

            // Spawn 1 protector
            spawnPowerBankProtector(opId, op, targetRoom, originRoom);

            // Spawn Squads
            if (
                squads.length < op.operativeCount &&
                !Object.values(Memory.spawnAssignments).some((assignment) => assignment.designee === op.originRoom) &&
                !Object.values(Memory.creeps).some((creep) => creep.destination === op.targetRoom && creep.role === Role.OPERATIVE)
            ) {
                const attackerBody = PopulationManagement.createPartsArray([ATTACK, MOVE], originRoom.energyCapacityAvailable, 20);
                const healerBody = PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25);
                createSquad(op, SquadType.DUO, attackerBody, healerBody, [], [], SquadTarget.POWER_BANK);
            }

            // Spawn Collectors
            if (targetRoom) {
                const powerBank = targetRoom
                    .find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_POWER_BANK })
                    .pop() as unknown as StructurePowerBank;

                // No need to check every tick since damage is consistent
                if (
                    Game.time % 50 === 0 &&
                    powerBank &&
                    !Object.values(Memory.creeps).some((creep) => creep.destination === targetRoom.name && creep.role === Role.OPERATIVE)
                ) {
                    // TTL Spawning
                    if (
                        squadLeaders.length === squads.length && // No more squads currently spawning in
                        CombatIntel.getMaxDmgOverLifetime(squadLeaders) < powerBank.hits && // Damage is not enough
                        squadLeaders.some((squadLeader) => squadLeader.ticksToLive < op.pathCost + 150) && // New squad can replace an old one
                        squads.length < op.operativeCount + 2 // Only allow at most 2 ttl spawn
                    ) {
                        const attackerBody = PopulationManagement.createPartsArray([ATTACK, MOVE], originRoom.energyCapacityAvailable, 20);
                        const healerBody = PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25);
                        createSquad(op, SquadType.DUO, attackerBody, healerBody, [], [], SquadTarget.POWER_BANK);
                    }

                    // Collectors spawn time (assuming 3 spawns are used it will need at least 150 ticks for every 3 collectors + 50 ticks since this is not checked every tick) + path cost (powercreeps ignored for now)
                    let numCollectors = Math.ceil(powerBank.power / 1250);
                    const timeNeededForCollectors = op.pathCost + Math.ceil(numCollectors / 3) * 150 + 50;
                    if (
                        powerBank.hits < CombatIntel.getMaxDmgOverLifetime(squadLeaders, timeNeededForCollectors) ||
                        powerBank.ticksToDecay < timeNeededForCollectors
                    ) {
                        // Spawn in Collectors
                        for (let i = 0; i < numCollectors; i++) {
                            Memory.spawnAssignments.push({
                                designee: op.originRoom,
                                body: PopulationManagement.createPartsArray([CARRY, MOVE], originRoom.energyCapacityAvailable, 25),
                                spawnOpts: {
                                    memory: {
                                        role: Role.OPERATIVE,
                                        room: op.originRoom,
                                        operationId: opId,
                                        currentTaskPriority: Priority.MEDIUM,
                                    },
                                },
                            });
                        }
                    }
                } else if (!powerBank) {
                    // Recycle Creeps after destroying powerbank
                    Object.values(Memory.creeps)
                        .filter((creep) => creep.assignment === targetRoom.name && creep.role !== Role.OPERATIVE)
                        .forEach((creep) => (creep.recycle = true));
                    Object.values(Memory.squads)
                        .filter((squad) => squad.assignment === targetRoom.name && squad.members)
                        .forEach((squad) => Object.values(squad.members).forEach((creepName) => (Memory.creeps[creepName].recycle = true)));
                    op.stage = OperationStage.CLAIM;
                    return;
                }

                // Wait until all operatives are in the room to avoid wasting power (should not happen but sometimes spawning takes too long for collectors)
                if (
                    powerBank &&
                    powerBank.hits < 10000 &&
                    Object.values(Memory.creeps).some(
                        (creep) =>
                            creep.destination === op.targetRoom && creep.role === Role.OPERATIVE && !creep._m?.lastCoord?.includes(op.targetRoom)
                    )
                ) {
                    squadLeaders.forEach((squadLeader) => (squadLeader.memory.stop = true));
                    Object.values(Memory.creeps)
                        .filter(
                            (creep) =>
                                creep.assignment === op.targetRoom && creep.role === Role.PROTECTOR && creep._m?.lastCoord?.includes(op.targetRoom)
                        )
                        .forEach((protector) => (protector.stop = true));
                } else {
                    squadLeaders.forEach((squadLeader) => delete squadLeader.memory.stop);
                    Object.values(Memory.creeps)
                        .filter(
                            (creep) =>
                                creep.assignment === op.targetRoom && creep.role === Role.PROTECTOR && creep._m?.lastCoord?.includes(op.targetRoom)
                        )
                        .forEach((protector) => delete protector.stop);
                }
            }
            break;
        case OperationStage.CLAIM:
            if (!Object.values(Memory.creeps).some((creep) => creep.destination === op.targetRoom && creep.role === Role.OPERATIVE)) {
                op.stage = OperationStage.COMPLETE;
            }
            break;
    }
}

/**
 * Send in one protector with each powerBank operation. By default it will be enough to kill other attack units.
 * If there is an enemy present then it will adjust the protector body.
 *
 * @param op
 * @param targetRoom
 */
function spawnPowerBankProtector(opId: string, op: Operation, targetRoom: Room, originRoom: Room) {
    const assignedProtectorCount =
        Object.values(Game.creeps).filter(
            (creep) =>
                creep.memory.assignment === op.targetRoom &&
                creep.memory.role === Role.PROTECTOR &&
                (creep.spawning || creep.ticksToLive > op.pathCost + 150)
        ).length +
        Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.assignment === op.targetRoom && creep.spawnOpts.memory.role === Role.PROTECTOR
        ).length;

    if (!assignedProtectorCount) {
        let notSpawned = true;
        if (targetRoom) {
            const combatIntel = CombatIntel.getCreepCombatData(targetRoom, true);
            if (combatIntel && combatIntel.totalAttack > 300) {
                const dmgNeeded =
                    CombatIntel.getPredictedDamageNeeded(combatIntel.totalHeal, combatIntel.highestDmgMultiplier, combatIntel.highestToughHits) +
                    Math.ceil(combatIntel.highestHP / 25);
                let body: BodyPartConstant[];
                let boosts = [];
                if (combatIntel.totalRanged > 200) {
                    boosts.push(BoostType.TOUGH);
                }
                if (combatIntel.totalRanged >= 120) {
                    boosts.push(BoostType.HEAL);
                }
                if (dmgNeeded >= 180) {
                    boosts.push(BoostType.RANGED_ATTACK);
                }
                body = PopulationManagement.createDynamicCreepBody(
                    originRoom,
                    [RANGED_ATTACK, HEAL, MOVE, TOUGH],
                    dmgNeeded,
                    Math.max(combatIntel.totalRanged, dmgNeeded / 2),
                    { boosts: boosts }
                );
                notSpawned = false;
            }
        }

        if (notSpawned) {
            const body = PopulationManagement.createDynamicCreepBody(Game.rooms[op.originRoom], [RANGED_ATTACK, HEAL, MOVE], 300, 160, {
                boosts: [BoostType.RANGED_ATTACK],
            });
            Memory.spawnAssignments.push({
                designee: op.originRoom,
                body: body,
                spawnOpts: {
                    memory: {
                        role: Role.PROTECTOR,
                        assignment: op.targetRoom,
                        currentTaskPriority: Priority.MEDIUM,
                        combat: { flee: false },
                        room: op.originRoom,
                    },
                },
            });
        }
    }
}

function createSquad(
    op: Operation,
    type: SquadType,
    attackerBody: BodyPartConstant[],
    healerBody: BodyPartConstant[],
    attackerBoost: BoostType[],
    healerBoost: BoostType[],
    target?: SquadTarget
) {
    const originRoom = Game.rooms[op.originRoom];
    let squadId = 's2' + Game.shard.name.slice(-1) + originRoom.name + Game.time.toString().slice(-4);
    if (type === SquadType.QUAD) {
        squadId = 's4' + Game.shard.name.slice(-1) + originRoom.name + Game.time.toString().slice(-4);
    }
    const hasSquadLeader =
        originRoom.creeps.find((creep) => creep.memory.role === Role.SQUAD_ATTACKER && creep.memory.assignment === op.targetRoom) ||
        Memory.spawnAssignments.find(
            (creep) => creep.spawnOpts.memory.assignment === op.targetRoom && creep.spawnOpts.memory.role === Role.SQUAD_ATTACKER
        );
    if (!hasSquadLeader) {
        Memory.spawnAssignments.push({
            designee: originRoom.name,
            body: attackerBody,
            spawnOpts: {
                memory: {
                    role: Role.SQUAD_ATTACKER,
                    room: originRoom.name,
                    currentTaskPriority: Priority.HIGH,
                    combat: {
                        flee: false,
                        squadId: squadId,
                        squadMemberType: SquadMemberType.SQUAD_LEADER,
                        squadTarget: target,
                    },
                },
                boosts: attackerBoost,
            },
        });
    }

    const hasSquadFollower =
        originRoom.creeps.find(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER && creep.memory.assignment === op.targetRoom
        ) ||
        Memory.spawnAssignments.find(
            (creep) =>
                creep.spawnOpts.memory.assignment === op.targetRoom &&
                creep.spawnOpts.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER
        );
    if (!hasSquadFollower) {
        Memory.spawnAssignments.push({
            designee: originRoom.name,
            body: healerBody,
            spawnOpts: {
                memory: {
                    role: Role.SQUAD_ATTACKER,
                    room: originRoom.name,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: {
                        flee: false,
                        squadId: squadId,
                        squadMemberType: SquadMemberType.SQUAD_FOLLOWER,
                    },
                },
                boosts: healerBoost,
            },
        });
    }

    if (type === SquadType.QUAD) {
        const hasSecondSquadLeader =
            originRoom.creeps.filter(
                (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_LEADER && creep.memory.assignment === op.targetRoom
            ).length +
            Memory.spawnAssignments.filter(
                (creep) =>
                    creep.spawnOpts.memory.assignment === op.targetRoom &&
                    creep.spawnOpts.memory.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_LEADER
            ).length;
        if (!hasSecondSquadLeader) {
            Memory.spawnAssignments.push({
                designee: originRoom.name,
                body: attackerBody,
                spawnOpts: {
                    memory: {
                        role: Role.SQUAD_ATTACKER,
                        room: originRoom.name,
                        currentTaskPriority: Priority.MEDIUM,
                        combat: {
                            flee: false,
                            squadId: squadId,
                            squadMemberType: SquadMemberType.SQUAD_SECOND_LEADER,
                        },
                    },
                    boosts: attackerBoost,
                },
            });
        }

        const hasSecondSquadFollower =
            originRoom.creeps.filter(
                (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_FOLLOWER && creep.memory.assignment === op.targetRoom
            ).length +
            Memory.spawnAssignments.filter(
                (creep) =>
                    creep.spawnOpts.memory.assignment === op.targetRoom &&
                    creep.spawnOpts.memory.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_FOLLOWER
            ).length;
        if (!hasSecondSquadFollower) {
            Memory.spawnAssignments.push({
                designee: originRoom.name,
                body: healerBody,
                spawnOpts: {
                    memory: {
                        role: Role.SQUAD_ATTACKER,
                        room: originRoom.name,
                        currentTaskPriority: Priority.MEDIUM,
                        combat: {
                            flee: false,
                            squadId: squadId,
                            squadMemberType: SquadMemberType.SQUAD_SECOND_FOLLOWER,
                        },
                    },
                    boosts: healerBoost,
                },
            });
        }
    }
    if (!Memory.squads) {
        Memory.squads = {};
    }
    Memory.squads[squadId] = { squadType: SquadType.DUO, forcedDestinations: op.waypoints, assignment: op.targetRoom };
}
