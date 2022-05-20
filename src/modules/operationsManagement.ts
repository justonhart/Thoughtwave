import { posFromMem } from './memoryManagement';
import { PopulationManagement } from './populationManagement';

export function manageOperations() {
    if (!Memory.empire.operations) {
        Memory.empire.operations = [];
    }

    let ops = Memory.empire.operations.filter((op) => op.stage !== OperationStage.COMPLETE);
    if (ops.length) {
        ops.forEach((op) => {
            switch (op.type) {
                case OperationType.COLONIZE:
                    manageColonizationOperation(op);
                    break;
                case OperationType.STERILIZE:
                    manageSterilizeOperation(op);
                    break;
            }
        });
    }

    Memory.empire.operations = ops;
}

function manageColonizationOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findBestColonyOrigin(posFromMem(op.targetPos));
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
                    },
                });
            }
            break;
        case OperationStage.BUILD:
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

export function addColonizationOperation(targetPos: RoomPosition) {
    let bestOrigin = findBestColonyOrigin(targetPos);

    if (bestOrigin) {
        let newOp: Operation = {
            targetRoom: targetPos.roomName,
            originRoom: bestOrigin,
            stage: OperationStage.CLAIM,
            targetPos: targetPos.toMemSafe(),
            type: OperationType.COLONIZE,
        };

        console.log(`${bestOrigin} selected for colonization of ${targetPos.roomName}`);

        Memory.empire.operations.push(newOp);
    } else {
        console.log('No suitable colony origin found');
    }
}

export function findBestColonyOrigin(spawnPosition: RoomPosition): string {
    const MAX_ROOM_LINEAR_DISTANCE = 10;

    let possibleSpawnRooms = Object.values(Game.rooms).filter(
        (room) =>
            room.controller?.my &&
            room.canSpawn() &&
            room.memory.phase === 2 &&
            room.energyStatus > EnergyStatus.CRITICAL &&
            Game.map.getRoomLinearDistance(room.name, spawnPosition.roomName) <= MAX_ROOM_LINEAR_DISTANCE
    );

    let bestRoom: string;

    let rooms = possibleSpawnRooms.map((room) => {
        return { name: room.name, path: PathFinder.search(room.storage?.pos, spawnPosition, { swampCost: 1, maxOps: 10000, maxCost: 590 }) };
    });
    rooms = rooms.filter((room) => !room.path.incomplete);

    if (rooms.length) {
        bestRoom = rooms.reduce((best, next) => {
            return next.path.cost <= best.path.cost ? next : best;
        }).name;
    }

    return bestRoom;
}

export function findOperationOrigin(targetPos: RoomPosition) {
    const MAX_ROOM_LINEAR_DISTANCE = 10;
    let possibleSpawnRooms = Object.values(Game.rooms).filter(
        (room) =>
            room.controller?.my &&
            room.canSpawn() &&
            room.memory.phase === 2 &&
            room.energyStatus > EnergyStatus.CRITICAL &&
            Game.map.getRoomLinearDistance(room.name, targetPos.roomName) <= MAX_ROOM_LINEAR_DISTANCE
    );

    let bestRoom: string;

    let rooms = possibleSpawnRooms.map((room) => {
        return { name: room.name, path: PathFinder.search(room.storage?.pos, targetPos, { swampCost: 1, maxOps: 10000 }) };
    });
    rooms = rooms.filter((room) => !room.path.incomplete);

    if (rooms.length) {
        bestRoom = rooms.reduce((best, next) => {
            return next.path.cost <= best.path.cost ? next : best;
        }).name;
    }

    return bestRoom;
}

export function addSterilizeOperation(targetPos: RoomPosition) {
    let origin = findOperationOrigin(targetPos);

    if (origin) {
        let newOp: Operation = {
            targetRoom: targetPos.roomName,
            originRoom: origin,
            stage: OperationStage.EXECUTE,
            targetPos: targetPos.toMemSafe(),
            type: OperationType.STERILIZE,
        };

        console.log(`${origin} selected for operation targeting ${targetPos.roomName}`);

        Memory.empire.operations.push(newOp);
    } else {
        console.log('No suitable origin found');
    }
}

function manageSterilizeOperation(op: Operation) {
    if (!Game.rooms[op.originRoom]) {
        op.originRoom = findOperationOrigin(posFromMem(op.targetPos));
    }

    let operativesCount = Object.values(Game.creeps).filter(
        (creep) => creep.memory.destination === op.targetRoom && creep.memory.operation === op.type
    ).length;
    if (op.originRoom && operativesCount < (op.operativeCount ?? 1)) {
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
