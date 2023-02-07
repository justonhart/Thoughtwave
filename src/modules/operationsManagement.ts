import { posFromMem } from './data';
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
    if (!Memory.operations) {
        Memory.operations = [];
    }

    Memory.operations = Memory.operations.filter((op) => op.stage !== OperationStage.COMPLETE && (op?.expireAt ?? Game.time + 1) >= Game.time);
    if (Memory.operations.length) {
        Memory.operations.forEach((op) => {
            switch (op.type) {
                case OperationType.COLONIZE:
                    manageColonizationOperation(op);
                    break;
                case OperationType.SECURE:
                    manageSecureRoomOperation(op);
                    break;
                case OperationType.ROOM_RECOVERY:
                    manageRoomRecoveryOperation(op);
                    break;
                case OperationType.ATTACK:
                    manageAttackRoomOperation(op);
                    break;
                case OperationType.QUAD_ATTACK:
                    manageQuadAttackRoomOperation(op);
                    break;
                case OperationType.COLLECTION:
                case OperationType.UPGRADE_BOOST:
                case OperationType.REMOTE_BUILD:
                case OperationType.STERILIZE:
                case OperationType.CLEAN:
                    manageSimpleOperation(op);
                    break;
            }
        });
    }
}

function manageColonizationOperation(op: Operation) {
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
                            portalLocations: op.portalLocations,
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
                                portalLocations: op.portalLocations,
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
                            portalLocations: op.portalLocations,
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
            Game.map.getRoomLinearDistance(room.name, targetRoom) <= (opts?.maxLinearDistance ?? 10) &&
            (opts?.multipleSpawns ? room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_SPAWN }).length >= 2 : true) &&
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
                    swampCost: 1,
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

function manageSimpleOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom)?.roomName;
    }

    let assignedOperativesCount =
        Object.values(Memory.creeps).filter((creep) => creep.destination === op.targetRoom && creep.operation === op.type).length +
        Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.operation === op.type
        ).length;
    if (op.originRoom && assignedOperativesCount < (op.operativeCount ?? 1)) {
        Memory.spawnAssignments.push({
            designee: op.originRoom,
            body: PopulationManagement.createPartsArray(OPERATOR_PARTS_MAP[op.type], Game.rooms[op.originRoom].energyCapacityAvailable),
            spawnOpts: {
                memory: {
                    role: Role.OPERATIVE,
                    operation: op.type,
                    destination: op.targetRoom,
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
        const originResult = findOperationOrigin(posFromMem(opts?.portalLocations?.[0])?.roomName ?? targetRoom, opts?.originOpts);
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
            ...opts,
        };

        console.log(`${originRoom} selected for operation targeting ${targetRoom}`);

        Memory.operations.push(newOp);
    } else {
        console.log('No suitable origin found');
    }
}

function manageSecureRoomOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        const operationResult = findOperationOrigin(op.targetRoom);
        op.originRoom = operationResult?.roomName;
        op.pathCost = operationResult?.cost;
    }

    const origin = Game.rooms[op.originRoom];

    const targetIsColonizeTarget = !!Memory.operations.find(
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
                },
            },
        });
    }
}

function manageRoomRecoveryOperation(op: Operation) {
    let targetRoom = Game.rooms[op.targetRoom];

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
                    },
                },
            });
        }
    });

    let numberOfRecoveryWorkers =
        Object.values(Memory.creeps).filter((creep) => creep.role === Role.WORKER && creep.room === op.targetRoom && creep.operation === op.type)
            .length +
        Memory.spawnAssignments.filter(
            (creep) =>
                creep.spawnOpts.memory.room === op.targetRoom &&
                creep.spawnOpts.memory.role === Role.WORKER &&
                creep.spawnOpts.memory.operation === op.type
        ).length;
    if (op.originRoom && numberOfRecoveryWorkers < (op.operativeCount ?? miningAssignments.length)) {
        Memory.spawnAssignments.push({
            designee: op.originRoom,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
            spawnOpts: {
                memory: {
                    role: Role.WORKER,
                    room: op.targetRoom,
                    operation: op.type,
                },
            },
        });
    }

    if (!roomNeedsCoreStructures(targetRoom)) {
        let opIndex = Memory.operations.findIndex((operation) => op === operation);
        Memory.operations[opIndex].stage = OperationStage.COMPLETE;

        placeBunkerConstructionSites(targetRoom);
    }
}

function manageAttackRoomOperation(op: Operation) {
    const originRoom = Game.rooms[op.originRoom];
    const squadId = 's2' + Game.shard.name.slice(-1) + originRoom.name + Game.time.toString().slice(-4);
    const hasSquadAttacker =
        originRoom.creeps.find((creep) => creep.memory.role === Role.SQUAD_ATTACKER && creep.memory.assignment === op.targetRoom) ||
        Memory.spawnAssignments.find(
            (creep) => creep.spawnOpts.memory.assignment === op.targetRoom && creep.spawnOpts.memory.role === Role.SQUAD_ATTACKER
        );
    if (!hasSquadAttacker) {
        Memory.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(MOVE, bodyA, bodyB)
            ),
            spawnOpts: {
                memory: {
                    role: Role.SQUAD_ATTACKER,
                    room: originRoom.name,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: {
                        flee: false,
                        squadId: squadId,
                        squadMemberType: SquadMemberType.SQUAD_LEADER,
                    },
                },
                boosts: [BoostType.DISMANTLE],
            },
        });
    }

    const hasSquadHealer =
        originRoom.creeps.find(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER && creep.memory.assignment === op.targetRoom
        ) ||
        Memory.spawnAssignments.find(
            (creep) =>
                creep.spawnOpts.memory.assignment === op.targetRoom &&
                creep.spawnOpts.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER
        );
    if (!hasSquadHealer) {
        Memory.spawnAssignments.push({
            designee: originRoom.name,
            body: [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)],
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
                boosts: [BoostType.HEAL],
            },
        });
    }
    if (!Memory.squads) {
        Memory.squads = {};
    }
    Memory.squads[squadId] = { squadType: SquadType.DUO, forcedDestinations: op.forcedDestinations, assignment: op.targetRoom };
    const opIndex = Memory.operations.findIndex((operation) => op === operation);
    Memory.operations[opIndex].stage = OperationStage.COMPLETE; // For now it will only spawn one set. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
}

function manageQuadAttackRoomOperation(op: Operation) {
    const originRoom = Game.rooms[op.originRoom];
    const squadId = 's4' + Game.shard.name.slice(-1) + originRoom.name + Game.time.toString().slice(-4);
    const hasSquadLeader =
        originRoom.creeps.filter(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_LEADER && creep.memory.assignment === op.targetRoom
        ).length +
        Memory.spawnAssignments.filter(
            (creep) =>
                creep.spawnOpts.memory.assignment === op.targetRoom && creep.spawnOpts.memory.combat?.squadMemberType === SquadMemberType.SQUAD_LEADER
        ).length;
    if (!hasSquadLeader) {
        Memory.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(MOVE, bodyA, bodyB)
            ),
            spawnOpts: {
                memory: {
                    role: Role.SQUAD_ATTACKER,
                    room: originRoom.name,
                    currentTaskPriority: Priority.HIGH,
                    combat: {
                        flee: false,
                        squadId: squadId,
                        squadMemberType: SquadMemberType.SQUAD_LEADER,
                    },
                },
                boosts: [BoostType.DISMANTLE],
            },
        });
    }

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
            body: PopulationManagement.createPartsArray([WORK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(MOVE, bodyA, bodyB)
            ),
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
                boosts: [BoostType.DISMANTLE],
            },
        });
    }

    const hasSquadFollower =
        originRoom.creeps.filter(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER && creep.memory.assignment === op.targetRoom
        ).length +
        Memory.spawnAssignments.filter(
            (creep) =>
                creep.spawnOpts.memory.assignment === op.targetRoom &&
                creep.spawnOpts.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER
        ).length;
    if (!hasSquadFollower) {
        Memory.spawnAssignments.push({
            designee: originRoom.name,
            body: [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)],
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
                boosts: [BoostType.HEAL],
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
            body: [RANGED_ATTACK, MOVE, ...PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable - 200, 24)],
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
                boosts: [BoostType.HEAL],
            },
        });
    }
    if (!Memory.squads) {
        Memory.squads = {};
    }
    Memory.squads[squadId] = { squadType: SquadType.QUAD, forcedDestinations: op.forcedDestinations, assignment: op.targetRoom };
    const opIndex = Memory.operations.findIndex((operation) => op === operation);
    Memory.operations[opIndex].stage = OperationStage.COMPLETE; // For now it will only spawn one set. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
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
    let origin = findOperationOrigin(posFromMem(portalLocations[0]).roomName)?.roomName;

    console.log(`launching intershard from ${origin}`);

    Memory.spawnAssignments.push({
        designee: origin,
        body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
        spawnOpts: {
            memory: {
                role: Role.CLAIMER,
                portalLocations: portalLocations,
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
                portalLocations: portalLocations,
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
                portalLocations: portalLocations,
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
                portalLocations: portalLocations,
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
                portalLocations: portalLocations,
            },
        },
    });
}
