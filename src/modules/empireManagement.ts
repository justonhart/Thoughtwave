import { posFromMem } from './memoryManagement';
import { PopulationManagement } from './populationManagement';

export function manageEmpire() {
    if (!Memory.empire) {
        Memory.empire = {
            spawnAssignments: [],
            colonizationOperations: [],
            scoutAssignments: new Map(),
        };
    }

    let needToInitIntershard = !JSON.parse(InterShardMemory.getLocal())?.outboundCreeps;
    if (needToInitIntershard) {
        InterShardMemory.setLocal(JSON.stringify({ outboundCreeps: { shard0: {}, shard1: {}, shard2: {}, shard3: {} } }));
    }

    if (Memory.empire?.colonizationOperations?.length) {
        manageColonizationOperations();
    }

    cleanSpawnAssignments();
}

export function manageColonizationOperations() {
    Memory.empire.colonizationOperations = Memory.empire.colonizationOperations.filter((op) => op.stage !== ColonizeStage.COMPLETE && op.origin);

    Memory.empire.colonizationOperations.forEach((colonizeOp) => {
        if (!Game.rooms[colonizeOp.origin]?.canSpawn()) {
            colonizeOp.origin = findBestColonyOrigin(posFromMem(colonizeOp.spawnPosition));
        }

        switch (colonizeOp.stage) {
            case ColonizeStage.CLAIM:
                let claimerExistsOrAssigned: boolean =
                    Object.values(Memory.creeps).filter((creep) => creep.role === Role.CLAIMER && creep.destination === colonizeOp.destination)
                        .length +
                        Memory.empire.spawnAssignments.filter(
                            (creep) => creep.memoryOptions.destination === colonizeOp.destination && creep.memoryOptions.role === Role.CLAIMER
                        ).length >
                    0;
                if (colonizeOp.origin && !claimerExistsOrAssigned) {
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
                if (colonizeOp.origin && numberOfColonizersFound < 2) {
                    Memory.empire.spawnAssignments.push({
                        designee: colonizeOp.origin,
                        body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[colonizeOp.origin].energyCapacityAvailable),
                        memoryOptions: {
                            role: Role.COLONIZER,
                            destination: colonizeOp.destination,
                        },
                    });
                }
                break;
        }
    });
}

export function addColonizationOperation(spawnPos: RoomPosition) {
    let bestOrigin = findBestColonyOrigin(spawnPos);

    if (bestOrigin) {
        let newOp: ColonizationOperation = {
            destination: spawnPos.roomName,
            origin: bestOrigin,
            stage: ColonizeStage.CLAIM,
            spawnPosition: Game.flags.colonize.pos.toMemSafe(),
        };

        console.log(`${bestOrigin} selected for colonization of ${spawnPos.roomName}`);

        Memory.empire.colonizationOperations.push(newOp);
    } else {
        console.log('No suitable colony origin found');
    }

    Game.flags.colonize.remove();
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

export function addHostileRoom(roomName: string, expirationTicks: number = 8000) {
    if (!Memory.empire.hostileRooms.find((hostileRoom) => hostileRoom.room === roomName)) {
        Memory.empire.hostileRooms.push({ room: roomName, expireAt: Game.time + expirationTicks });
    }
}

export function unclaimRoom(roomName: string) {
    let room = Game.rooms[roomName];

    if (room?.controller?.my) {
        room.controller.unclaim();
    }

    if (room?.find(FIND_MY_CONSTRUCTION_SITES).length) {
        room.find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => site.remove());
    }

    Memory.empire.colonizationOperations = Memory.empire.colonizationOperations.filter((op) => op.destination !== roomName);
    Memory.empire.spawnAssignments = Memory.empire.spawnAssignments.filter(
        (asssignment) => asssignment.designee !== roomName && asssignment.memoryOptions.destination !== roomName
    );

    delete Memory.rooms[roomName];

    return 'done';
}

//remove assignments to rooms that cannot spawn
function cleanSpawnAssignments() {
    Memory.empire.spawnAssignments = Memory.empire.spawnAssignments.filter(
        (assignment) => Game.rooms[assignment.designee] && Game.rooms[assignment.designee].canSpawn()
    );
}
