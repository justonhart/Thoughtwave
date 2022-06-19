import { posFromMem } from './memoryManagement';
import { PopulationManagement } from './populationManagement';
import { getSpawnPos, placeBunkerConstructionSites, roomNeedsCoreStructures } from './roomDesign';

const OPERATION_STARTING_STAGE_MAP: Record<OperationType, OperationStage> = {
    1: OperationStage.CLAIM,
    2: OperationStage.ACTIVE,
    3: OperationStage.ACTIVE,
    4: OperationStage.ACTIVE,
    5: OperationStage.ACTIVE,
    6: OperationStage.ACTIVE,
    7: OperationStage.ACTIVE,
};

export function manageOperations() {
    if (!Memory.empire.operations) {
        Memory.empire.operations = [];
    }

    Memory.empire.operations = Memory.empire.operations.filter(
        (op) => op.stage !== OperationStage.COMPLETE && (op?.expireAt ?? Game.time + 1) >= Game.time
    );
    if (Memory.empire.operations.length) {
        Memory.empire.operations.forEach((op) => {
            switch (op.type) {
                case OperationType.COLONIZE:
                    manageColonizationOperation(op);
                    break;
                case OperationType.STERILIZE:
                    manageSterilizeOperation(op);
                    break;
                case OperationType.COLLECTION:
                    manageCollectionOperation(op);
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
            }
        });
    }
}

function manageColonizationOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom);
    }

    switch (op.stage) {
        case OperationStage.CLAIM:
            let claimerExistsOrAssigned: boolean =
                Object.values(Memory.creeps).filter((creep) => creep.role === Role.CLAIMER && creep.destination === op.targetRoom).length +
                    Memory.empire.spawnAssignments.filter(
                        (creep) => creep.memoryOptions.destination === op.targetRoom && creep.memoryOptions.role === Role.CLAIMER
                    ).length >
                0;
            if (op.originRoom && !claimerExistsOrAssigned) {
                Memory.empire.spawnAssignments.push({
                    designee: op.originRoom,
                    body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
                    memoryOptions: {
                        role: Role.CLAIMER,
                        destination: op.targetRoom,
                        room: op.originRoom,
                        portalLocations: op.portalLocations,
                    },
                });
            }
            break;
        case OperationStage.BUILD:
            let miningAssignments = Object.keys(Memory.rooms[op.targetRoom]?.miningAssignments);
            miningAssignments.forEach((key) => {
                if (
                    Memory.rooms[op.targetRoom]?.miningAssignments?.[key] === AssignmentStatus.UNASSIGNED &&
                    !Memory.empire.spawnAssignments.filter(
                        (creep) => creep.memoryOptions.room === op.targetRoom && creep.memoryOptions.assignment === key
                    ).length
                ) {
                    Memory.rooms[op.targetRoom].miningAssignments[key] = AssignmentStatus.ASSIGNED;
                    Memory.empire.spawnAssignments.push({
                        designee: op.originRoom,
                        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
                        memoryOptions: {
                            role: Role.MINER,
                            assignment: key,
                            room: op.targetRoom,
                            portalLocations: op.portalLocations,
                        },
                    });
                }
            });

            let numberOfColonizersFound =
                Object.values(Memory.creeps).filter((creep) => creep.role === Role.COLONIZER && creep.destination === op.targetRoom).length +
                Memory.empire.spawnAssignments.filter(
                    (creep) => creep.memoryOptions.destination === op.targetRoom && creep.memoryOptions.role === Role.COLONIZER
                ).length;
            if (op.originRoom && numberOfColonizersFound < 2) {
                Memory.empire.spawnAssignments.push({
                    designee: op.originRoom,
                    body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
                    memoryOptions: {
                        role: Role.COLONIZER,
                        destination: op.targetRoom,
                        portalLocations: op.portalLocations,
                    },
                });
            }
            break;
    }
}

export function findOperationOrigin(targetRoom: string, opts?: OriginOpts) {
    let possibleSpawnRooms = Object.values(Game.rooms).filter(
        (room) =>
            room.controller?.my &&
            room.canSpawn() &&
            room.energyStatus >= (opts?.minEnergyStatus ?? EnergyStatus.RECOVERING) &&
            Game.map.getRoomLinearDistance(room.name, targetRoom) <= (opts?.maxLinearDistance ?? 10)
    );

    let bestRoom: string;

    let rooms = possibleSpawnRooms.map((room) => {
        return {
            name: room.name,
            path: PathFinder.search(
                room.controller?.pos,
                { pos: new RoomPosition(25, 25, targetRoom), range: 23 },
                { maxRooms: 25, swampCost: 1, maxOps: 10000 }
            ),
        };
    });
    rooms = rooms.filter((room) => !room.path.incomplete);

    if (rooms.length) {
        bestRoom = rooms.reduce((best, next) => {
            return next.path.cost <= best.path.cost ? next : best;
        }).name;
    }

    return bestRoom;
}

function manageSterilizeOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom);
    }

    let assignedOperativesCount =
        Object.values(Memory.creeps).filter((creep) => creep.destination === op.targetRoom && creep.operation === op.type).length +
        Memory.empire.spawnAssignments.filter(
            (creep) => creep.memoryOptions.destination === op.targetRoom && creep.memoryOptions.operation === op.type
        ).length;
    if (op.originRoom && assignedOperativesCount < (op.operativeCount ?? 1)) {
        let availableOperatives = Object.values(Game.creeps).filter((creep) => creep.memory.role === Role.OPERATIVE && !creep.memory.operation);

        if (availableOperatives.length) {
            let reassignedOperative = availableOperatives.pop();
            reassignedOperative.memory.destination = op.targetRoom;
            reassignedOperative.memory.operation = op.type;

            console.log(`Reassigned ${reassignedOperative.name} to operation targeting ${op.targetRoom}`);
        } else {
            Memory.empire.spawnAssignments.push({
                designee: op.originRoom,
                body: PopulationManagement.createPartsArray([WORK, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
                memoryOptions: {
                    role: Role.OPERATIVE,
                    operation: OperationType.STERILIZE,
                    destination: op.targetRoom,
                },
            });
        }
    }
}

function manageCollectionOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom);
    }

    let assignedOperativesCount =
        Object.values(Memory.creeps).filter((creep) => creep.destination === op.targetRoom && creep.operation === op.type).length +
        Memory.empire.spawnAssignments.filter(
            (creep) => creep.memoryOptions.destination === op.targetRoom && creep.memoryOptions.operation === op.type
        ).length;
    if (op.originRoom && assignedOperativesCount < (op.operativeCount ?? 1)) {
        let availableOperatives = Object.values(Game.creeps).filter((creep) => creep.memory.role === Role.OPERATIVE && !creep.memory.operation);

        if (availableOperatives.length) {
            let reassignedOperative = availableOperatives.pop();
            reassignedOperative.memory.destination = op.targetRoom;
            reassignedOperative.memory.operation = op.type;

            console.log(`Reassigned ${reassignedOperative.name} to operation targeting ${op.targetRoom}`);
        } else {
            Memory.empire.spawnAssignments.push({
                designee: op.originRoom,
                body: PopulationManagement.createPartsArray([CARRY, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
                memoryOptions: {
                    role: Role.OPERATIVE,
                    operation: OperationType.COLLECTION,
                    destination: op.targetRoom,
                },
            });
        }
    }
}

export function addOperation(operationType: OperationType, targetRoom: string, opts?: OperationOpts) {
    let originRoom = opts?.originRoom;
    delete opts?.originRoom;

    if (!originRoom) {
        originRoom = findOperationOrigin(posFromMem(opts?.portalLocations?.[0])?.roomName ?? targetRoom, opts?.originOpts);
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

        Memory.empire.operations.push(newOp);
    } else {
        console.log('No suitable origin found');
    }
}

function manageSecureRoomOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(op.targetRoom);
    }

    let origin = Game.rooms[op.originRoom];

    let assignedProtectorCount =
        Object.values(Memory.creeps).filter((creep) => creep.assignment === op.targetRoom && creep.role === Role.PROTECTOR).length +
        Memory.empire.spawnAssignments.filter(
            (creep) => creep.memoryOptions.assignment === op.targetRoom && creep.memoryOptions.role === Role.PROTECTOR
        ).length;

    if (Game.rooms[op.originRoom] && assignedProtectorCount < op.operativeCount) {
        let targetIsColonizeTarget = !!Memory.empire.operations.find(
            (otherOperation) => op.targetRoom === otherOperation.targetRoom && otherOperation.type === OperationType.COLONIZE
        );
        let bodyParts = targetIsColonizeTarget ? [ATTACK, MOVE] : [RANGED_ATTACK, MOVE];

        const body = PopulationManagement.createPartsArray(bodyParts, origin.energyCapacityAvailable - 300);
        body.push(HEAL, MOVE);
        Memory.empire.spawnAssignments.push({
            designee: op.originRoom,
            body: body,
            memoryOptions: {
                role: Role.PROTECTOR,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.MEDIUM,
                combat: { flee: false },
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
            !Memory.empire.spawnAssignments.filter((creep) => creep.memoryOptions.room === op.targetRoom && creep.memoryOptions.assignment === key)
                .length
        ) {
            Memory.rooms[op.targetRoom].miningAssignments[key] = AssignmentStatus.ASSIGNED;
            Memory.empire.spawnAssignments.push({
                designee: op.originRoom,
                body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
                memoryOptions: {
                    role: Role.MINER,
                    assignment: key,
                    room: op.targetRoom,
                },
            });
        }
    });

    let numberOfRecoveryWorkers =
        Object.values(Memory.creeps).filter((creep) => creep.role === Role.WORKER && creep.room === op.targetRoom && creep.operation === op.type)
            .length +
        Memory.empire.spawnAssignments.filter(
            (creep) =>
                creep.memoryOptions.room === op.targetRoom && creep.memoryOptions.role === Role.WORKER && creep.memoryOptions.operation === op.type
        ).length;
    if (op.originRoom && numberOfRecoveryWorkers < (op.operativeCount ?? miningAssignments.length)) {
        Memory.empire.spawnAssignments.push({
            designee: op.originRoom,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
            memoryOptions: {
                role: Role.WORKER,
                room: op.targetRoom,
                operation: op.type,
            },
        });
    }

    if (!roomNeedsCoreStructures(targetRoom)) {
        let opIndex = Memory.empire.operations.findIndex((operation) => op === operation);
        Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE;

        placeBunkerConstructionSites(targetRoom);
    }
}

function manageAttackRoomOperation(op: Operation) {
    const originRoom = Game.rooms[op.originRoom];

    const hasSquadAttacker =
        originRoom.creeps.find((creep) => creep.memory.role === Role.SQUAD_ATTACKER && creep.memory.assignment === op.targetRoom) ||
        Memory.empire.spawnAssignments.find(
            (creep) => creep.memoryOptions.assignment === op.targetRoom && creep.memoryOptions.role === Role.SQUAD_ATTACKER
        );
    if (!hasSquadAttacker) {
        Memory.empire.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(MOVE, bodyA, bodyB)
            ),
            memoryOptions: {
                role: Role.SQUAD_ATTACKER,
                room: originRoom.name,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.MEDIUM,
                combat: {
                    flee: false,
                    squadMemberType: SquadMemberType.SQUAD_LEADER,
                    squadType: SquadType.DUO,
                    forcedDestinations: op.forcedDestinations,
                },
            },
        });
    }

    const hasSquadHealer =
        originRoom.creeps.find(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER && creep.memory.assignment === op.targetRoom
        ) ||
        Memory.empire.spawnAssignments.find(
            (creep) =>
                creep.memoryOptions.assignment === op.targetRoom && creep.memoryOptions.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER
        );
    if (!hasSquadHealer) {
        Memory.empire.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(HEAL, bodyA, bodyB)
            ),
            memoryOptions: {
                role: Role.SQUAD_HEALER,
                room: originRoom.name,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.MEDIUM,
                combat: {
                    flee: false,
                    squadMemberType: SquadMemberType.SQUAD_FOLLOWER,
                    squadType: SquadType.DUO,
                    forcedDestinations: op.forcedDestinations,
                },
            },
        });
    }
    let opIndex = Memory.empire.operations.findIndex((operation) => op === operation);
    Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE; // For now it will only spawn 2. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
}

function manageQuadAttackRoomOperation(op: Operation) {
    const originRoom = Game.rooms[op.originRoom];

    const hasSquadLeader =
        originRoom.creeps.filter(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_LEADER && creep.memory.assignment === op.targetRoom
        ).length +
        Memory.empire.spawnAssignments.filter(
            (creep) =>
                creep.memoryOptions.assignment === op.targetRoom && creep.memoryOptions.combat?.squadMemberType === SquadMemberType.SQUAD_LEADER
        ).length;
    if (!hasSquadLeader) {
        Memory.empire.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(MOVE, bodyA, bodyB)
            ),
            memoryOptions: {
                role: Role.SQUAD_ATTACKER,
                room: originRoom.name,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.HIGH,
                combat: {
                    flee: false,
                    forcedDestinations: op.forcedDestinations,
                    squadType: SquadType.QUAD,
                    squadMemberType: SquadMemberType.SQUAD_LEADER,
                },
            },
        });
    }

    const hasSecondSquadLeader =
        originRoom.creeps.filter(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_LEADER && creep.memory.assignment === op.targetRoom
        ).length +
        Memory.empire.spawnAssignments.filter(
            (creep) =>
                creep.memoryOptions.assignment === op.targetRoom &&
                creep.memoryOptions.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_LEADER
        ).length;
    if (!hasSecondSquadLeader) {
        Memory.empire.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(MOVE, bodyA, bodyB)
            ),
            memoryOptions: {
                role: Role.SQUAD_ATTACKER,
                room: originRoom.name,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.MEDIUM,
                combat: {
                    flee: false,
                    forcedDestinations: op.forcedDestinations,
                    squadType: SquadType.QUAD,
                    squadMemberType: SquadMemberType.SQUAD_SECOND_LEADER,
                },
            },
        });
    }

    const hasSquadFollower =
        originRoom.creeps.filter(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER && creep.memory.assignment === op.targetRoom
        ).length +
        Memory.empire.spawnAssignments.filter(
            (creep) =>
                creep.memoryOptions.assignment === op.targetRoom && creep.memoryOptions.combat?.squadMemberType === SquadMemberType.SQUAD_FOLLOWER
        ).length;
    if (!hasSquadFollower) {
        Memory.empire.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(HEAL, bodyA, bodyB)
            ),
            memoryOptions: {
                role: Role.SQUAD_HEALER,
                room: originRoom.name,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.MEDIUM,
                combat: {
                    flee: false,
                    forcedDestinations: op.forcedDestinations,
                    squadType: SquadType.QUAD,
                    squadMemberType: SquadMemberType.SQUAD_FOLLOWER,
                },
            },
        });
    }

    const hasSecondSquadFollower =
        originRoom.creeps.filter(
            (creep) => creep.memory.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_FOLLOWER && creep.memory.assignment === op.targetRoom
        ).length +
        Memory.empire.spawnAssignments.filter(
            (creep) =>
                creep.memoryOptions.assignment === op.targetRoom &&
                creep.memoryOptions.combat?.squadMemberType === SquadMemberType.SQUAD_SECOND_FOLLOWER
        ).length;
    if (!hasSecondSquadFollower) {
        Memory.empire.spawnAssignments.push({
            designee: originRoom.name,
            body: PopulationManagement.createPartsArray([HEAL, MOVE], originRoom.energyCapacityAvailable, 25).sort((bodyA, bodyB) =>
                sortByBodyPart(HEAL, bodyA, bodyB)
            ),
            memoryOptions: {
                role: Role.SQUAD_HEALER,
                room: originRoom.name,
                assignment: op.targetRoom,
                currentTaskPriority: Priority.MEDIUM,
                combat: {
                    flee: false,
                    forcedDestinations: op.forcedDestinations,
                    squadType: SquadType.QUAD,
                    squadMemberType: SquadMemberType.SQUAD_SECOND_FOLLOWER,
                },
            },
        });
    }
    let opIndex = Memory.empire.operations.findIndex((operation) => op === operation);
    Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE; // For now it will only spawn 2. Later this can check TTL to spawn reinforments or even multiple until targetRoom has been cleared
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
    let origin = findOperationOrigin(posFromMem(portalLocations[0]).roomName);

    console.log(`launching intershard from ${origin}`);

    Memory.empire.spawnAssignments.push({
        designee: origin,
        body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
        memoryOptions: {
            role: Role.CLAIMER,
            portalLocations: portalLocations,
            destination: destinationRoom,
        },
    });

    Memory.empire.spawnAssignments.push({
        designee: origin,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
        memoryOptions: {
            role: Role.INTERSHARD_TRAVELLER,
            nextRole: Role.MINER,
            destination: destinationRoom,
            portalLocations: portalLocations,
        },
    });

    Memory.empire.spawnAssignments.push({
        designee: origin,
        body: [WORK, WORK, WORK, WORK, WORK, MOVE, MOVE, MOVE, MOVE, MOVE],
        memoryOptions: {
            role: Role.INTERSHARD_TRAVELLER,
            nextRole: Role.MINER,
            destination: destinationRoom,
            portalLocations: portalLocations,
        },
    });

    Memory.empire.spawnAssignments.push({
        designee: origin,
        body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
        memoryOptions: {
            role: Role.INTERSHARD_TRAVELLER,
            nextRole: Role.WORKER,
            destination: destinationRoom,
            portalLocations: portalLocations,
        },
    });

    Memory.empire.spawnAssignments.push({
        designee: origin,
        body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
        memoryOptions: {
            role: Role.INTERSHARD_TRAVELLER,
            nextRole: Role.WORKER,
            destination: destinationRoom,
            portalLocations: portalLocations,
        },
    });
}
