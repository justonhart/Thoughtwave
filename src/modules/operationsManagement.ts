import { CombatIntel } from './combatIntel';
import { addVisionRequest, observerInRange } from './data';
import { Pathing } from './pathing';
import { PopulationManagement } from './populationManagement';
import { getSpawnPos, roomNeedsCoreStructures } from './roomDesign';

const OPERATION_STARTING_STAGE_MAP: { [key in OperationType]?: OperationStage } = {
    [OperationType.COLONIZE]: OperationStage.PREPARE,
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
    [OperationType.TRANSFER]: OperationStage.ACTIVE,
};

const OPERATOR_PARTS_MAP: { [key in OperationType]?: BodyPartConstant[] } = {
    [OperationType.CLEAN]: [WORK, MOVE],
    [OperationType.COLLECTION]: [CARRY, CARRY, MOVE],
    [OperationType.REMOTE_BUILD]: [WORK, CARRY, MOVE, MOVE],
    [OperationType.UPGRADE_BOOST]: [WORK, CARRY, MOVE, MOVE],
    [OperationType.STERILIZE]: [WORK, MOVE],
    [OperationType.TRANSFER]: [CARRY, CARRY, MOVE, MOVE],
};

const OPERATION_BOOST_MAP: { [key in OperationType]?: BoostType[] } = {
    [OperationType.CLEAN]: [BoostType.DISMANTLE],
    [OperationType.COLLECTION]: [BoostType.CARRY],
    [OperationType.REMOTE_BUILD]: [BoostType.BUILD],
    [OperationType.UPGRADE_BOOST]: [BoostType.UPGRADE],
    [OperationType.STERILIZE]: [BoostType.DISMANTLE],
    [OperationType.TRANSFER]: [BoostType.CARRY],
};

export function manageOperations() {
    Object.entries(Memory.operations).forEach(([operationId, operation]) => {
        if (operation.stage === OperationStage.COMPLETE) {
            //child operation lifecycles are managed by parents
            if (!operation.parentId || !Memory.operations[operation.parentId]) {
                if (Memory.debug.logOperations) {
                    console.log(`Operation ${operationId} (Type: ${operation.type} completed successfully`);
                }
                delete Memory.operations[operationId];
            }
        } else if (operation.stage === OperationStage.FAILED) {
            //child operation lifecycles are managed by parents
            if (!operation.parentId || !Memory.operations[operation.parentId]) {
                if (Memory.debug.logOperations) {
                    console.log(`Operation ${operationId} (Type: ${operation.type} failed`);
                }
                delete Memory.operations[operationId];
            }
        } else if (operation.stage === OperationStage.SUSPEND) {
        } else {
            try {
                switch (operation.type) {
                    case OperationType.COLONIZE:
                        manageColonizeOperation(operationId);
                        break;
                    case OperationType.SECURE:
                        manageSecureRoomOperation(operationId);
                        break;
                    case OperationType.ROOM_RECOVERY:
                        manageRoomRecoveryOperation(operationId);
                        break;
                    case OperationType.ATTACK:
                        manageAttackRoomOperation(operationId);
                        break;
                    case OperationType.QUAD_ATTACK:
                        manageQuadAttackRoomOperation(operationId);
                        break;
                    case OperationType.POWER_BANK:
                        manageAddPowerBankOperation(operationId);
                        break;
                    case OperationType.COLLECTION:
                    case OperationType.UPGRADE_BOOST:
                    case OperationType.REMOTE_BUILD:
                    case OperationType.STERILIZE:
                    case OperationType.CLEAN:
                    case OperationType.TRANSFER:
                        manageSimpleOperation(operationId);
                        break;
                }
            } catch (e) {
                console.log(`Error caught in operation ${operationId}: \n${e}`);
            }
        }
    });
}

function manageColonizeOperation(opId: string) {
    const OPERATION = Memory.operations[opId] as ColonizeOperation;
    if (!Game.rooms[OPERATION.originRoom]) {
        OPERATION.originRoom = findOperationOrigin(OPERATION.targetRoom)?.roomName;
    }

    const originRoom = Game.rooms[OPERATION.originRoom];
    const targetRoom = Game.rooms[OPERATION.targetRoom];

    switch (OPERATION.stage) {
        case OperationStage.PREPARE:
            const routeCallback = (roomName: string, fromRoomName: string) => {
                return Memory.roomData[roomName]?.hostile
                    ? Infinity
                    : Memory.roomData[roomName]?.roomStatus === RoomMemoryStatus.RESERVED_OTHER
                    ? 5
                    : 1;
            };

            if (!OPERATION.pathRooms) {
                const route = Game.map.findRoute(OPERATION.originRoom, OPERATION.targetRoom, { routeCallback });
                if (route === -2) {
                    OPERATION.stage = OperationStage.FAILED;
                    console.log(`Colonize operation to ${OPERATION.targetRoom} failed - no routes found`);
                } else {
                    OPERATION.pathRooms = [OPERATION.originRoom, ...route.map((val) => val.room)];
                }
            }

            if (
                !Game.rooms[OPERATION.originRoom].observer ||
                OPERATION.pathRooms.some((room) => Game.map.getRoomLinearDistance(OPERATION.originRoom, room) > 10)
            ) {
                if (
                    !Object.values(Memory.creeps).some((creepMem: ScoutMemory) => creepMem.role === Role.SCOUT && creepMem.operationId === opId) &&
                    !Memory.spawnAssignments.some(
                        (assignment) =>
                            assignment.spawnOpts.memory.role === Role.SCOUT && (assignment.spawnOpts.memory as ScoutMemory).operationId === opId
                    )
                ) {
                    Memory.spawnAssignments.push({
                        designee: OPERATION.originRoom,
                        spawnOpts: {
                            memory: {
                                role: Role.SCOUT,
                                operationId: opId,
                                room: OPERATION.originRoom,
                            } as ScoutMemory,
                        },
                        body: [MOVE, MOVE],
                    });
                }
            } else {
                //use observer to confirm path
                const nextRoomToObserve = OPERATION.pathRooms.find((pathRoomName) => !Memory.roomData[pathRoomName]?.asOf);
                if (nextRoomToObserve && !OPERATION.visionRequests.some((req) => Memory.visionRequests[req]?.completed === false)) {
                    const visionRequestId = addVisionRequest({
                        targetRoom: nextRoomToObserve,
                    } as VisionRequest);
                    OPERATION.visionRequests.push(visionRequestId);
                } else {
                    OPERATION.routeConfirmed = true;
                }
            }

            if (OPERATION.pathRooms.some((roomName) => Memory.roomData[roomName]?.hostile)) {
                delete OPERATION.pathRooms;
            }

            if (OPERATION.routeConfirmed) {
                OPERATION.stage = OperationStage.CLAIM;
            } else {
                break;
            }
        case OperationStage.CLAIM:
            //Creep management
            const invaderCorePresent = Game.rooms[OPERATION.targetRoom]?.hostileStructures.some((s) => s.structureType === STRUCTURE_INVADER_CORE);
            if (invaderCorePresent) {
                const coreDestroyerAssigned =
                    Object.values(Game.creeps).some(
                        (c) =>
                            c.memory.role === Role.PROTECTOR &&
                            c.body.some((part) => part.type === ATTACK) &&
                            c.memory.assignment === OPERATION.targetRoom
                    ) ||
                    Memory.spawnAssignments.some(
                        (assignment) =>
                            assignment.spawnOpts.memory.role === Role.PROTECTOR && assignment.spawnOpts.memory.assignment === OPERATION.targetRoom
                    );

                if (!coreDestroyerAssigned) {
                    Memory.spawnAssignments.push({
                        designee: OPERATION.originRoom,
                        body: PopulationManagement.createPartsArray([ATTACK, MOVE], Game.rooms[OPERATION.originRoom].energyCapacityAvailable),
                        spawnOpts: {
                            memory: {
                                role: Role.PROTECTOR,
                                assignment: OPERATION.targetRoom,
                                room: OPERATION.originRoom,
                                waypoints: OPERATION.waypoints,
                                combat: { flee: false },
                                currentTaskPriority: Priority.MEDIUM,
                            },
                            boosts: [BoostType.ATTACK],
                        },
                    });
                }
            }

            const claimerExistsOrAssigned: boolean =
                Object.values(Memory.creeps).some((creep: OperativeMemory) => creep.role === Role.CLAIMER && creep.operationId === opId) ||
                Memory.spawnAssignments.some(
                    (creep) => (creep.spawnOpts.memory as OperativeMemory).operationId === opId && creep.spawnOpts.memory.role === Role.CLAIMER
                );
            if (OPERATION.originRoom && !claimerExistsOrAssigned) {
                const claimerMemory: ClaimerMemory = {
                    role: Role.CLAIMER,
                    operationId: opId,
                    room: OPERATION.originRoom,
                    waypoints: OPERATION.waypoints,
                    claimRoomType: RoomType.HOMEROOM,
                };
                Memory.spawnAssignments.push({
                    designee: OPERATION.originRoom,
                    body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
                    spawnOpts: {
                        memory: claimerMemory,
                    },
                });
            }

            //Operation Logic
            const targetRoomClaimed = Game.rooms[OPERATION.targetRoom]?.controller.my;
            if (targetRoomClaimed) {
                OPERATION.stage = OperationStage.BUILD;
            } else {
                break;
            }
        case OperationStage.BUILD:
            const room = Game.rooms[OPERATION.targetRoom];
            if (!room) {
                OPERATION.stage = OperationStage.CLAIM;
                break;
            }

            if (!OPERATION.workers) {
                OPERATION.workers = [];
            }

            OPERATION.workers = OPERATION.workers.filter((name) => {
                return !!Game.creeps[name] || Memory.spawnAssignments.some((a) => a.name === name);
            });

            if (targetRoom?.memory.miningAssignments) {
                //creep management
                const workCount = OPERATION.workers.reduce(
                    (sum, next) =>
                        Game.creeps[next]
                            ? Game.creeps[next].getActiveBodyparts(WORK) + sum
                            : Memory.spawnAssignments
                                  .find((a) => a.name === next)
                                  .body.reduce((partSum, nextPart) => (nextPart === WORK ? partSum + 1 : partSum), 0) + sum,
                    0
                );
                if (Object.values(targetRoom.memory.miningAssignments).some((a) => a === AssignmentStatus.UNASSIGNED)) {
                    const emptyMiningAssignment = Object.keys(targetRoom.memory.miningAssignments).find(
                        (assignment) => targetRoom.memory.miningAssignments[assignment] === AssignmentStatus.UNASSIGNED
                    );
                    const options: SpawnOptions = {
                        memory: {
                            role: Role.MINER,
                            room: OPERATION.targetRoom,
                            assignment: emptyMiningAssignment,
                        },
                    };
                    const name = `om${Game.time.toString().slice(-4)}`;
                    targetRoom.memory.miningAssignments[emptyMiningAssignment] = name;
                    originRoom.addSpawnAssignment(
                        PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 5),
                        options,
                        name
                    );
                } else if (
                    !OPERATION.transporter ||
                    (!Game.creeps[OPERATION.transporter] && !Memory.spawnAssignments.some((a) => a.name === OPERATION.transporter))
                ) {
                    if (
                        OPERATION.transporter &&
                        !Game.creeps[OPERATION.transporter] &&
                        !Memory.spawnAssignments.some((a) => a.name === OPERATION.transporter)
                    ) {
                        delete OPERATION.transporter;
                    }

                    if (!OPERATION.transporter) {
                        const options: SpawnOptions = {
                            memory: {
                                role: Role.TRANSPORTER,
                                room: OPERATION.targetRoom,
                            },
                        };
                        const name = `od${Game.time.toString().slice(-4)}`;
                        let result = originRoom.addSpawnAssignment(
                            PopulationManagement.createPartsArray([CARRY, MOVE], originRoom.energyCapacityAvailable, 25),
                            options,
                            name
                        );
                        if (result === OK) {
                            OPERATION.transporter = name;
                        }
                    }
                } else if (workCount < Object.keys(targetRoom.memory.miningAssignments).length * 10) {
                    const workNeeded = 10 * Object.keys(targetRoom.memory.miningAssignments).length - workCount;
                    const options: SpawnOptions = {
                        memory: {
                            role: Role.WORKER,
                            room: OPERATION.targetRoom,
                        },
                    };
                    const name = `ow${Game.time.toString().slice(-4)}`;
                    let result = originRoom.addSpawnAssignment(
                        PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], originRoom.energyCapacityAvailable, workNeeded),
                        options,
                        name
                    );
                    if (result === OK) {
                        OPERATION.workers.push(name);
                    }
                }
            }

            if (targetRoom.mySpawns.length) {
                OPERATION.stage = OperationStage.COMPLETE;
            }
            break;
    }
    Memory.operations[opId] = OPERATION;
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
            (opts?.minSpawnCount ? room.mySpawns.length >= opts.minSpawnCount : true) &&
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

function manageSimpleOperation(opId: string) {
    const OPERATION = Memory.operations[opId] as SimpleOperation;
    if (!Game.rooms[OPERATION.originRoom]) {
        OPERATION.originRoom = findOperationOrigin(OPERATION.targetRoom)?.roomName;
    }

    if (OPERATION.type === OperationType.TRANSFER && (OPERATION as ResourceOperation).targetAmount === undefined) {
        (OPERATION as ResourceOperation).targetAmount = 200000;
        (OPERATION as ResourceOperation).currentAmount = 0;
    }

    const operativeCount =
        Object.values(Game.creeps).reduce((sum, nextCreep) => ((nextCreep.memory as OperativeMemory).operationId === opId ? sum + 1 : sum), 0) +
        Object.values(Memory.spawnAssignments).reduce(
            (sum, nextAssignment) => ((nextAssignment.spawnOpts.memory as OperativeMemory).operationId === opId ? sum + 1 : sum),
            0
        );

    if (OPERATION.originRoom && operativeCount < (OPERATION.operativeCount ?? 1)) {
        const operativeMemory: OperativeMemory = {
            role: Role.OPERATIVE,
            operationId: opId,
            room: OPERATION.originRoom,
        };

        Memory.spawnAssignments.push({
            designee: OPERATION.originRoom,
            body: PopulationManagement.createPartsArray(OPERATOR_PARTS_MAP[OPERATION.type], Game.rooms[OPERATION.originRoom].energyCapacityAvailable),
            spawnOpts: {
                memory: operativeMemory,
                boosts: OPERATION_BOOST_MAP[OPERATION.type],
            },
        });
    }

    if (
        OPERATION.expireAt <= Game.time ||
        (OPERATION.type === OperationType.TRANSFER && (OPERATION as ResourceOperation).currentAmount >= (OPERATION as ResourceOperation).targetAmount)
    ) {
        console.log((OPERATION as ResourceOperation).currentAmount + ' | ' + (OPERATION as ResourceOperation).targetAmount);
        OPERATION.stage = OperationStage.COMPLETE;
    }
    Memory.operations[opId] = OPERATION;
}

export function addOperation(operationType: OperationType, targetRoom: string, opts?: OperationOpts): string {
    let originRoom = opts?.originRoom;
    delete opts?.originRoom;

    if (!originRoom) {
        const originResult = findOperationOrigin(opts?.waypoints?.[0]?.toRoomPos()?.roomName ?? targetRoom, opts?.originOpts);
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
            subOperations: [],
            ...opts,
        };

        const nextOperationId = `o${operationType}_${Game.time}_${global.identifierIncrement++}`;
        if (Memory.debug.logOperations) {
            console.log(`${originRoom} selected for operation ${nextOperationId}`);
        }

        Memory.operations[nextOperationId] = newOp;
        return nextOperationId;
    } else if (Memory.debug.logOperations) {
        console.log('No suitable origin found');
    }
}

function manageSecureRoomOperation(opId: string) {
    const OPERATION = Memory.operations[opId] as SecureOperation;
    if (!Game.rooms[OPERATION.originRoom]) {
        const operationResult = findOperationOrigin(OPERATION.targetRoom);
        OPERATION.originRoom = operationResult?.roomName;
        OPERATION.pathCost = operationResult?.cost;
    }

    const origin = Game.rooms[OPERATION.originRoom];

    const bodyParts = [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE, MOVE];
    const body = PopulationManagement.createPartsArray(bodyParts, origin.energyCapacityAvailable);
    let assignedProtectorCount =
        Object.values(Game.creeps).filter(
            (creep) =>
                creep.memory.assignment === OPERATION.targetRoom &&
                creep.memory.role === Role.PROTECTOR &&
                (creep.spawning || creep.ticksToLive > OPERATION.pathCost + body.length * 3)
        ).length +
        Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.assignment === OPERATION.targetRoom && creep.spawnOpts.memory.role === Role.PROTECTOR
        ).length;

    if (Game.rooms[OPERATION.originRoom] && assignedProtectorCount < OPERATION.protectorCount) {
        Memory.spawnAssignments.push({
            designee: OPERATION.originRoom,
            body: body,
            spawnOpts: {
                memory: {
                    role: Role.PROTECTOR,
                    assignment: OPERATION.targetRoom,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { flee: false },
                    room: OPERATION.targetRoom,
                    waypoints: OPERATION.waypoints,
                },
                boosts: [BoostType.RANGED_ATTACK, BoostType.HEAL],
            },
        });
    }

    Memory.operations[opId] = OPERATION;
}

function manageRoomRecoveryOperation(opId: string) {
    const OPERATION = Memory.operations[opId] as RoomRecoveryOperation;
    const originRoom = Game.rooms[OPERATION.originRoom];
    const targetRoom = Game.rooms[OPERATION.targetRoom];

    if (!targetRoom.myConstructionSites.find((site) => site.structureType === STRUCTURE_SPAWN)) {
        let spawnPos = getSpawnPos(targetRoom);
        targetRoom.createConstructionSite(spawnPos, STRUCTURE_SPAWN);
    }

    let miningAssignments = Object.keys(Memory.rooms[OPERATION.targetRoom]?.miningAssignments);
    let i = 1;
    miningAssignments.forEach((key) => {
        if (
            Memory.rooms[OPERATION.targetRoom]?.miningAssignments?.[key] === AssignmentStatus.UNASSIGNED ||
            (!Game.creeps[targetRoom.memory.miningAssignments[key]] &&
                !Memory.spawnAssignments.some((a) => a.name === targetRoom.memory.miningAssignments[key]))
        ) {
            const name = `om${Game.time.toString().slice(-4)}${i++}`;
            Memory.rooms[OPERATION.targetRoom].miningAssignments[key] = name;
            Memory.spawnAssignments.push({
                designee: OPERATION.originRoom,
                body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
                spawnOpts: {
                    memory: {
                        role: Role.MINER,
                        assignment: key,
                        room: OPERATION.targetRoom,
                        waypoints: OPERATION.waypoints,
                    },
                },
                name: name,
            });
        }
    });

    if (!OPERATION.transporter) {
        const options: SpawnOptions = {
            memory: {
                role: Role.TRANSPORTER,
                room: OPERATION.targetRoom,
            },
        };
        const name = `ot${Game.time.toString().slice(-4)}`;
        let result = originRoom.addSpawnAssignment(
            PopulationManagement.createPartsArray([CARRY, MOVE], originRoom.energyCapacityAvailable, 25),
            options,
            name
        );
        if (result === OK) {
            OPERATION.transporter = name;
        }
    }

    OPERATION.workers = OPERATION.workers?.filter((name) => !!Game.creeps[name] || Memory.spawnAssignments.some((a) => a.name === name)) ?? [];
    const workCount = OPERATION.workers.reduce(
        (sum, next) =>
            Game.creeps[next]
                ? Game.creeps[next].getActiveBodyparts(WORK) + sum
                : Memory.spawnAssignments
                      .find((a) => a.name === next)
                      .body.reduce((partSum, nextPart) => (nextPart === WORK ? partSum + 1 : partSum), 0) + sum,
        0
    );
    if (workCount < Object.keys(targetRoom.memory.miningAssignments).length * 10) {
        const workNeeded = Object.keys(targetRoom.memory.miningAssignments).length * 10 - workCount;
        const options: SpawnOptions = {
            memory: {
                role: Role.WORKER,
                room: OPERATION.targetRoom,
            },
        };
        const name = `ow${Game.time.toString().slice(-4)}`;
        let result = originRoom.addSpawnAssignment(
            PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], originRoom.energyCapacityAvailable, workNeeded),
            options,
            name
        );
        if (result === OK) {
            OPERATION.workers.push(name);
        }
    }

    if (!roomNeedsCoreStructures(targetRoom)) {
        OPERATION.stage = OperationStage.COMPLETE;
    }

    Memory.operations[opId] = OPERATION;
}

function manageAttackRoomOperation(opId: string) {
    const OPERATION = Memory.operations[opId];
    const originRoom = Game.rooms[OPERATION.originRoom];
    const attackerBody = PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
        sortByBodyPart(MOVE, bodyA, bodyB)
    );
    const healerBody = [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)];
    createSquad(OPERATION, SquadType.DUO, attackerBody, healerBody, [BoostType.DISMANTLE], [BoostType.HEAL]);
    OPERATION.stage = OperationStage.COMPLETE; // For now it will only spawn one set. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
    Memory.operations[opId] = OPERATION;
}

function manageQuadAttackRoomOperation(opId: string) {
    const OPERATION = Memory.operations[opId];
    const originRoom = Game.rooms[OPERATION.originRoom];
    const attackerBody = PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
        sortByBodyPart(MOVE, bodyA, bodyB)
    );
    const healerBody = [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)];
    createSquad(OPERATION, SquadType.QUAD, attackerBody, healerBody, [BoostType.DISMANTLE], [BoostType.HEAL]);
    OPERATION.stage = OperationStage.COMPLETE; // For now it will only spawn one set. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
    Memory.operations[opId] = OPERATION;
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
function manageAddPowerBankOperation(opId: string) {
    const OPERATION = Memory.operations[opId] as PowerBankOperation;
    const targetRoom = Game.rooms[OPERATION.targetRoom];
    const originRoom = Game.rooms[OPERATION.originRoom];
    switch (OPERATION.stage) {
        case OperationStage.PREPARE:
            if (OPERATION.pathCost > 500) {
                Memory.roomData[OPERATION.targetRoom].powerBank = false;
                OPERATION.stage = OperationStage.COMPLETE;
                return;
            } else if (
                Object.values(Memory.operations).some(
                    (operation) => operation.type === OperationType.POWER_BANK && operation.originRoom === OPERATION.originRoom && operation.stage > 1
                )
            ) {
                OPERATION.stage = OperationStage.COMPLETE; // Do not set powerBank to false since other originRooms might be in range
                return;
            }
            if (targetRoom) {
                OPERATION.visionRequests = [];
                const powerBank = targetRoom.structures.find((s) => s.structureType === STRUCTURE_POWER_BANK) as StructurePowerBank;
                if (powerBank && powerBank.ticksToDecay > 2500 && powerBank.power > 2000) {
                    const numFreeSpaces = Math.min(
                        targetRoom
                            .lookForAtArea(LOOK_TERRAIN, powerBank.pos.y - 1, powerBank.pos.x - 1, powerBank.pos.y + 1, powerBank.pos.x + 1, true)
                            .filter((lookPos) => lookPos.terrain !== 'wall').length,
                        4
                    );

                    // Avoid conflict
                    const hasEnemies = targetRoom.hostileCreeps.some(
                        (creep) => creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK)
                    );
                    // Don't bother getting powerbanks with only one space of access (could do that later but will have to boost healer/attacker)
                    if (numFreeSpaces > 1 && !hasEnemies) {
                        OPERATION.operativeCount = numFreeSpaces;
                        OPERATION.stage = OperationStage.ACTIVE;
                        return;
                    }
                }
                Memory.roomData[OPERATION.targetRoom].powerBank = false;
                OPERATION.stage = OperationStage.COMPLETE;
            } else if (observerInRange(OPERATION.targetRoom) && !OPERATION.visionRequests?.some((id) => Memory.visionRequests[id])) {
                //add vision request
                let result = addVisionRequest({ targetRoom: OPERATION.targetRoom });
                OPERATION.visionRequests.push(result as string);
            }
            break;
        case OperationStage.ACTIVE:
            // Alive or currently spawning squads
            const squads = Object.values(Memory.squads).filter(
                (squad) => squad.assignment === OPERATION.targetRoom && (!squad.members || squad.members[SquadMemberType.SQUAD_LEADER])
            );

            // If attackers are dying then abandon operation
            const squadLeaders = squads.filter((squad) => squad.members).map((squad) => Game.creeps[squad.members[SquadMemberType.SQUAD_LEADER]]);
            squadLeaders.forEach((squadLeader) => {
                if (squadLeader.hits < squadLeader.hitsMax / 4) {
                    // Recycle Creeps after destroying powerbank
                    Object.values(Memory.creeps)
                        .filter((creep) => creep.assignment === targetRoom.name || creep.destination === targetRoom.name)
                        .forEach((creep) => (creep.recycle = true));
                    Object.values(Memory.squads)
                        .filter((squad) => squad.assignment === targetRoom.name && squad.members)
                        .forEach((squad) => Object.values(squad.members).forEach((creepName) => (Memory.creeps[creepName].recycle = true)));
                    OPERATION.stage = OperationStage.COMPLETE;
                    return;
                }
            });

            // Spawn 1 protector
            spawnPowerBankProtector(OPERATION);

            // Spawn Squads
            if (
                squads.length < OPERATION.operativeCount &&
                !Object.values(Memory.spawnAssignments).some((assignment) => assignment.designee === OPERATION.originRoom) &&
                !Object.values(Memory.creeps).some((creep) => creep.destination === OPERATION.targetRoom && creep.role === Role.OPERATIVE)
            ) {
                const attackerBody = PopulationManagement.createPartsArray([ATTACK, MOVE], originRoom.energyCapacityAvailable, 20);
                const healerBody = PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25);
                createSquad(OPERATION, SquadType.DUO, attackerBody, healerBody, [], [], SquadTarget.POWER_BANK);
            }

            // Spawn Collectors
            if (targetRoom) {
                const powerBank = targetRoom.structures.find((s) => s.structureType === STRUCTURE_POWER_BANK) as StructurePowerBank;

                // No need to check every tick since damage is consistent
                if (
                    Game.time % 50 === 0 &&
                    powerBank &&
                    !Object.values(Memory.creeps).some(
                        (creep: OperativeMemory) =>
                            Memory.operations[creep.operationId]?.targetRoom === targetRoom.name && creep.role === Role.OPERATIVE
                    ) &&
                    !Object.values(Memory.spawnAssignments).some(
                        (spawnAssignment) =>
                            Memory.operations[(spawnAssignment.spawnOpts.memory as OperativeMemory)?.operationId]?.targetRoom === targetRoom.name &&
                            spawnAssignment.spawnOpts.memory.role === Role.OPERATIVE
                    )
                ) {
                    // TTL Spawning
                    if (
                        squadLeaders.length === squads.length && // No more squads currently spawning in
                        CombatIntel.getMaxDmgOverLifetime(squadLeaders) < powerBank.hits && // Damage is not enough
                        squadLeaders.some((squadLeader) => squadLeader.ticksToLive < OPERATION.pathCost + 150) && // New squad can replace an old one
                        squads.length < OPERATION.operativeCount + 2 // Only allow at most 2 ttl spawn
                    ) {
                        const attackerBody = PopulationManagement.createPartsArray([ATTACK, MOVE], originRoom.energyCapacityAvailable, 20);
                        const healerBody = PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25);
                        createSquad(OPERATION, SquadType.DUO, attackerBody, healerBody, [], [], SquadTarget.POWER_BANK);
                    }

                    // Collectors spawn time (assuming 3 spawns are used it will need at least 150 ticks for every 3 collectors + 50 ticks since this is not checked every tick) + path cost (powercreeps ignored for now)
                    let numCollectors = Math.ceil(powerBank.power / 1250);
                    const timeNeededForCollectors = OPERATION.pathCost + Math.ceil(numCollectors / 3) * 150 + 50;
                    if (
                        powerBank.hits < CombatIntel.getMaxDmgOverLifetime(squadLeaders, timeNeededForCollectors) ||
                        powerBank.ticksToDecay < timeNeededForCollectors
                    ) {
                        // Spawn in Collectors
                        for (let i = 0; i < numCollectors; i++) {
                            Memory.spawnAssignments.push({
                                designee: OPERATION.originRoom,
                                body: PopulationManagement.createPartsArray([CARRY, MOVE], originRoom.energyCapacityAvailable, 25),
                                spawnOpts: {
                                    memory: {
                                        role: Role.OPERATIVE,
                                        room: OPERATION.originRoom,
                                        operationId: opId,
                                        currentTaskPriority: Priority.MEDIUM,
                                    } as OperativeMemory,
                                },
                            });
                        }
                    }
                } else if (!powerBank) {
                    // Recycle Creeps after destroying powerbank
                    Object.values(Memory.creeps)
                        .filter((creep: OperativeMemory) => creep.assignment === targetRoom.name && creep.role === Role.PROTECTOR)
                        .forEach((creep) => (creep.recycle = true));
                    Object.values(Memory.squads)
                        .filter((squad) => squad.assignment === targetRoom.name && squad.members)
                        .forEach((squad) => Object.values(squad.members).forEach((creepName) => (Memory.creeps[creepName].recycle = true)));
                    OPERATION.stage = OperationStage.CLAIM;
                    break;
                }

                // Wait until all operatives are in the room to avoid wasting power (should not happen but sometimes spawning takes too long for collectors)
                if (
                    powerBank &&
                    powerBank.hits < 10000 &&
                    Object.values(Memory.creeps).some(
                        (creep: OperativeMemory) =>
                            Memory.operations[creep.operationId]?.targetRoom === OPERATION.targetRoom &&
                            creep.role === Role.OPERATIVE &&
                            !creep._m?.lastCoord?.includes(OPERATION.targetRoom)
                    )
                ) {
                    squadLeaders.forEach((squadLeader) => (squadLeader.memory.stop = true));
                    Object.values(Memory.creeps)
                        .filter(
                            (creep) =>
                                creep.assignment === OPERATION.targetRoom &&
                                creep.role === Role.PROTECTOR &&
                                creep._m?.lastCoord?.includes(OPERATION.targetRoom)
                        )
                        .forEach((protector) => (protector.stop = true));
                } else {
                    squadLeaders.forEach((squadLeader) => delete squadLeader.memory.stop);
                    Object.values(Memory.creeps)
                        .filter(
                            (creep) =>
                                creep.assignment === OPERATION.targetRoom &&
                                creep.role === Role.PROTECTOR &&
                                creep._m?.lastCoord?.includes(OPERATION.targetRoom)
                        )
                        .forEach((protector) => delete protector.stop);
                }
            }
            break;
        case OperationStage.CLAIM:
            if (
                !Object.values(Memory.creeps).some(
                    (creep: OperativeMemory) =>
                        Memory.operations[creep.operationId]?.targetRoom === OPERATION.targetRoom && creep.role === Role.OPERATIVE
                )
            ) {
                OPERATION.stage = OperationStage.COMPLETE;
            }
            break;
    }
    Memory.operations[opId] = OPERATION;
}

/**
 * Send in one protector with each powerBank operation. By default it will be enough to kill other attack units.
 * If there is an enemy present then it will adjust the protector body.
 *
 * @param op
 * @param targetRoom
 */
function spawnPowerBankProtector(op: PowerBankOperation) {
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
        const body = PopulationManagement.createPartsArray(
            [RANGED_ATTACK, RANGED_ATTACK, HEAL, MOVE, MOVE, MOVE],
            Game.rooms[op.originRoom].energyCapacityAvailable
        );
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
        originRoom.myCreepsByMemory.find((creep) => creep.memory.role === Role.SQUAD_ATTACKER && creep.memory.assignment === op.targetRoom) ||
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
        originRoom.myCreepsByMemory.find(
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
            originRoom.myCreepsByMemory.filter(
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
            originRoom.myCreepsByMemory.filter(
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
