import { PopulationManagement } from './populationManagement';
import { getSpawnPos, placeBunkerConstructionSites } from './roomDesign';

const OPERATION_STARTING_STAGE_MAP: Record<OperationType, OperationStage> = {
    1: OperationStage.CLAIM,
    2: OperationStage.ACTIVE,
    3: OperationStage.ACTIVE,
    4: OperationStage.ACTIVE,
    5: OperationStage.ACTIVE,
};

export function manageOperations() {
    if (!Memory.empire.operations) {
        Memory.empire.operations = [];
    }

    let ops = Memory.empire.operations.filter((op) => op.stage !== OperationStage.COMPLETE || op?.expireAt <= Game.time);
    if (ops.length) {
        ops.forEach((op) => {
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
            }
        });
    }

    Memory.empire.operations = ops;
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
        originRoom = findOperationOrigin(targetRoom, opts?.originOpts);
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
                room: op.originRoom,
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
        Object.values(Memory.creeps).filter((creep) => creep.role === Role.WORKER && creep.room === op.targetRoom).length +
        Memory.empire.spawnAssignments.filter((creep) => creep.memoryOptions.room === op.targetRoom && creep.memoryOptions.role === Role.WORKER)
            .length;
    if (op.originRoom && numberOfRecoveryWorkers < (op.operativeCount ?? miningAssignments.length)) {
        Memory.empire.spawnAssignments.push({
            designee: op.originRoom,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[op.originRoom].energyCapacityAvailable),
            memoryOptions: {
                role: Role.WORKER,
                room: op.targetRoom,
            },
        });
    }

    if (targetRoom.canSpawn()) {
        let opIndex = Memory.empire.operations.findIndex((operation) => op === operation);
        Memory.empire.operations[opIndex].stage = OperationStage.COMPLETE;

        placeBunkerConstructionSites(targetRoom);
    }
}
