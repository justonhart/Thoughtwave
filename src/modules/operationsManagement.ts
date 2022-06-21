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
                case OperationType.UPGRADE_BOOST:
                    manageUpgradeBoostOperation(op);
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
                        (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.role === Role.CLAIMER
                    ).length >
                0;
            if (op.originRoom && !claimerExistsOrAssigned) {
                Memory.empire.spawnAssignments.push({
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
                    !Memory.empire.spawnAssignments.filter(
                        (creep) => creep.spawnOpts.memory.room === op.targetRoom && creep.spawnOpts.memory.assignment === key
                    ).length
                ) {
                    Memory.rooms[op.targetRoom].miningAssignments[key] = AssignmentStatus.ASSIGNED;
                    Memory.empire.spawnAssignments.push({
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
                Memory.empire.spawnAssignments.filter(
                    (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.role === Role.COLONIZER
                ).length;
            if (op.originRoom && numberOfColonizersFound < 2) {
                Memory.empire.spawnAssignments.push({
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
            (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.operation === op.type
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
                spawnOpts: {
                    memory: {
                        role: Role.OPERATIVE,
                        operation: OperationType.STERILIZE,
                        destination: op.targetRoom,
                    },
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
            (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.operation === op.type
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
                spawnOpts: {
                    memory: {
                        role: Role.OPERATIVE,
                        operation: OperationType.COLLECTION,
                        destination: op.targetRoom,
                    },
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
            (creep) => creep.spawnOpts.memory.assignment === op.targetRoom && creep.spawnOpts.memory.role === Role.PROTECTOR
        ).length;

    if (Game.rooms[op.originRoom] && assignedProtectorCount < op.operativeCount) {
        let targetIsColonizeTarget = !!Memory.empire.operations.find(
            (otherOperation) => op.targetRoom === otherOperation.targetRoom && otherOperation.type === OperationType.COLONIZE
        );
        let bodyParts =
            targetIsColonizeTarget &&
            Game.rooms[op.targetRoom]?.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE }).length
                ? [ATTACK, MOVE]
                : [RANGED_ATTACK, MOVE];

        const body = PopulationManagement.createPartsArray(bodyParts, origin.energyCapacityAvailable - 300);
        body.push(HEAL, MOVE);
        Memory.empire.spawnAssignments.push({
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
            !Memory.empire.spawnAssignments.filter(
                (creep) => creep.spawnOpts.memory.room === op.targetRoom && creep.spawnOpts.memory.assignment === key
            ).length
        ) {
            Memory.rooms[op.targetRoom].miningAssignments[key] = AssignmentStatus.ASSIGNED;
            Memory.empire.spawnAssignments.push({
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
        Memory.empire.spawnAssignments.filter(
            (creep) =>
                creep.spawnOpts.memory.room === op.targetRoom &&
                creep.spawnOpts.memory.role === Role.WORKER &&
                creep.spawnOpts.memory.operation === op.type
        ).length;
    if (op.originRoom && numberOfRecoveryWorkers < (op.operativeCount ?? miningAssignments.length)) {
        Memory.empire.spawnAssignments.push({
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
        let opIndex = Memory.empire.operations.findIndex((operation) => op === operation);
        Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE;

        placeBunkerConstructionSites(targetRoom);
    }
}

export function launchIntershardParty(portalLocations: string[], destinationRoom: string) {
    let origin = findOperationOrigin(posFromMem(portalLocations[0]).roomName);

    console.log(`launching intershard from ${origin}`);

    Memory.empire.spawnAssignments.push({
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

    Memory.empire.spawnAssignments.push({
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

    Memory.empire.spawnAssignments.push({
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

    Memory.empire.spawnAssignments.push({
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

    Memory.empire.spawnAssignments.push({
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
function manageUpgradeBoostOperation(op: Operation) {
    let originRoom = Game.rooms[op.originRoom];

    //consider operation done once room hits lvl 6
    if (Game.rooms[op.targetRoom].controller.level >= 6) {
        let opIndex = Memory.empire.operations.findIndex((findOp) => findOp.targetRoom === op.targetRoom && findOp.type === op.type);
        if (opIndex > -1) {
            Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE;
        }
        return;
    }

    let assignedOperativesCount =
        Object.values(Memory.creeps).filter((creep) => creep.destination === op.targetRoom && creep.operation === op.type).length +
        Memory.empire.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.destination === op.targetRoom && creep.spawnOpts.memory.operation === op.type
        ).length;
    if (op.originRoom && assignedOperativesCount < (op.operativeCount ?? 1) && originRoom.energyStatus >= EnergyStatus.STABLE) {
        let availableOperatives = Object.values(Game.creeps).filter((creep) => creep.memory.role === Role.OPERATIVE && !creep.memory.operation);

        if (availableOperatives.length) {
            let reassignedOperative = availableOperatives.pop();
            reassignedOperative.memory.destination = op.targetRoom;
            reassignedOperative.memory.operation = op.type;

            console.log(`Reassigned ${reassignedOperative.name} to operation targeting ${op.targetRoom}`);
        } else {
            Memory.empire.spawnAssignments.push({
                designee: op.originRoom,
                body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
                spawnOpts: {
                    memory: {
                        role: Role.OPERATIVE,
                        operation: OperationType.UPGRADE_BOOST,
                        destination: op.targetRoom,
                    },
                },
            });
        }
    }
}
