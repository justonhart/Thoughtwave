import { createPartsArray } from './populationManagement';

export function manageEmpire() {
    if (!Memory.empire) {
        Memory.empire = {
            spawnAssignments: [],
            colonizationOperations: [],
            scoutAssignments: new Map(),
        };
    }

    if (Game.flags.colonize) {
        addColonizationOperation();
    }

    if (Memory.empire.colonizationOperations.length) {
        manageColonistCreeps();
    }
}

export function manageColonistCreeps() {
    Memory.empire.colonizationOperations.forEach((colonizeOp, index) => {
        switch (colonizeOp.stage) {
            case ColonizeStage.CLAIM:
                let claimerExistsOrAssigned: boolean =
                    Object.values(Memory.creeps).filter((creep) => creep.role === Role.CLAIMER && creep.destination === colonizeOp.destination)
                        .length +
                        Memory.empire.spawnAssignments.filter(
                            (creep) => creep.memoryOptions.destination === colonizeOp.destination && creep.memoryOptions.role === Role.CLAIMER
                        ).length >
                    0;
                if (!claimerExistsOrAssigned) {
                    Memory.empire.spawnAssignments.push({
                        designee: colonizeOp.origin,
                        body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
                        memoryOptions: {
                            role: Role.CLAIMER,
                            destination: colonizeOp.destination,
                        },
                    });
                }
                break;
            case ColonizeStage.BUILD:
                let numberOfColonizersFound =
                    Object.values(Memory.creeps).filter((creep) => creep.role === Role.COLONIZER && creep.destination === colonizeOp.destination)
                        .length +
                    Memory.empire.spawnAssignments.filter(
                        (creep) => creep.memoryOptions.destination === colonizeOp.destination && creep.memoryOptions.role === Role.COLONIZER
                    ).length;
                if (numberOfColonizersFound < 2) {
                    Memory.empire.spawnAssignments.push({
                        designee: colonizeOp.origin,
                        body: createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[colonizeOp.origin].energyCapacityAvailable),
                        memoryOptions: {
                            role: Role.COLONIZER,
                            destination: colonizeOp.destination,
                        },
                    });
                }
                break;
            case ColonizeStage.COMPLETE:
                Memory.empire.colonizationOperations.splice(index, 1);
                break;
        }
    });
}

function addColonizationOperation() {
    let bestOrigin = findBestColonyOrigin(Game.flags.colonize.pos.roomName);

    if (bestOrigin) {
        let newOp: ColonizationOperation = {
            destination: Game.flags.colonize.pos.roomName,
            origin: bestOrigin,
            stage: ColonizeStage.CLAIM,
            spawnPosition: Game.flags.colonize.pos.toMemSafe(),
        };
        Memory.empire.colonizationOperations.push(newOp);
    } else {
        console.log('No suitable colony origin found');
    }

    Game.flags.colonize.remove();
}

function findBestColonyOrigin(targetRoom: string) {
    let possibleSpawnRooms = Object.values(Game.rooms).filter((room) => room.controller?.my && room.memory.phase === 2);

    let closestRoom = possibleSpawnRooms.reduce((closestRoom, roomToCompare) =>
        Game.map.getRoomLinearDistance(closestRoom.name, targetRoom) < Game.map.getRoomLinearDistance(roomToCompare.name, targetRoom)
            ? closestRoom
            : roomToCompare
    );

    return Game.map.getRoomLinearDistance(closestRoom.name, targetRoom) < 11 ? closestRoom.name : undefined;
}
