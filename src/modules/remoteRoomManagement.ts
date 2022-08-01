import { isCenterRoom, isKeeperRoom as isKeeperRoom } from './data';
import { PopulationManagement } from './populationManagement';
import { getStoragePos } from './roomDesign';

export function manageRemoteRoom(controllingRoomName: string, remoteRoomName: string) {
    let remoteRoom = Game.rooms[remoteRoomName];
    if (remoteRoom) {
        Memory.remoteData[remoteRoomName].threatLevel = monitorThreatLevel(remoteRoom);
    }

    if (
        Memory.roomData[remoteRoomName].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
        Memory.remoteData[remoteRoomName].threatLevel === RemoteRoomThreatLevel.INVADER_CORE &&
        !PopulationManagement.hasProtector(remoteRoomName) &&
        !reassignIdleProtector(controllingRoomName, remoteRoomName)
    ) {
        const maxSize = 10;
        const body = PopulationManagement.createPartsArray([ATTACK, MOVE], Game.rooms[controllingRoomName].energyCapacityAvailable - 300, maxSize);
        body.push(HEAL, MOVE);
        Memory.spawnAssignments.push({
            designee: controllingRoomName,
            body: body,
            spawnOpts: {
                memory: {
                    role: Role.PROTECTOR,
                    room: controllingRoomName,
                    assignment: remoteRoomName,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { flee: false },
                },
            },
        });
    } else if (
        Memory.roomData[remoteRoomName].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
        Memory.remoteData[remoteRoomName].threatLevel >= RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS &&
        !PopulationManagement.hasProtector(remoteRoomName) &&
        !reassignIdleProtector(controllingRoomName, remoteRoomName)
    ) {
        const maxSize = 6;
        const body = PopulationManagement.createPartsArray(
            [RANGED_ATTACK, MOVE],
            Game.rooms[controllingRoomName].energyCapacityAvailable - 300,
            maxSize
        );
        body.push(HEAL, MOVE);
        Memory.spawnAssignments.push({
            designee: controllingRoomName,
            body: body,
            spawnOpts: {
                memory: {
                    role: Role.PROTECTOR,
                    room: controllingRoomName,
                    assignment: remoteRoomName,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { flee: false },
                },
            },
        });
    }
}

export function findMiningPositions(controllingRoomName: string, remoteRoomName: string): string[] {
    let controllingRoom = Game.rooms[controllingRoomName];
    let remoteRoom = Game.rooms[remoteRoomName];

    let harvestTargets: Source[] = remoteRoom.find(FIND_SOURCES);
    let miningPositions: string[] = [];

    harvestTargets.forEach((target) => {
        const path = PathFinder.search(getStoragePos(controllingRoom), { pos: target.pos, range: 1 });
        if (!path.incomplete) {
            miningPositions.push(path.path.pop().toMemSafe());
        }
    });

    return miningPositions;
}

export function calculateRemoteMinerWorkNeeded(roomName: string) {
    let data = Memory.roomData[roomName];
    let energyPotential = isKeeperRoom(roomName) ? 4000 * 3 : 3000 * data.sourceCount;
    let workNeeded = energyPotential / (HARVEST_POWER * 300);

    return workNeeded > 5 ? workNeeded * 1.2 : workNeeded;
}

function monitorThreatLevel(room: Room) {
    let creeps = room.find(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username !== 'Source Keeper' });
    let hasInvaderCore = !!room.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE }).length;
    return creeps.some((c) => c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) > 0)
        ? RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS
        : creeps.length
        ? RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS
        : hasInvaderCore
        ? RemoteRoomThreatLevel.INVADER_CORE
        : RemoteRoomThreatLevel.SAFE;
}

//requires room visibility to find mining positions
export function addRemoteRoom(controllingRoomName: string, remoteRoomName: string) {
    if (!Game.rooms[remoteRoomName]) {
        return ERR_NOT_FOUND;
    }

    if (!Memory.rooms[controllingRoomName].remoteMiningRooms) {
        Memory.rooms[controllingRoomName].remoteMiningRooms = [];
    }

    if (Memory.rooms[controllingRoomName].remoteMiningRooms[remoteRoomName]) {
        return ERR_NAME_EXISTS;
    } else {
        Memory.rooms[controllingRoomName].remoteMiningRooms.push(remoteRoomName);
    }

    let miningPositions = findMiningPositions(controllingRoomName, remoteRoomName);

    let remoteData: RemoteData = {
        gatherer: AssignmentStatus.UNASSIGNED,
        miner: AssignmentStatus.UNASSIGNED,
        threatLevel: RemoteRoomThreatLevel.SAFE,
        miningPositions: miningPositions,
    };

    if (isKeeperRoom(remoteRoomName)) {
        remoteData.keeperExterminator = AssignmentStatus.UNASSIGNED;
    } else if (!isCenterRoom(remoteRoomName)) {
        remoteData.reservationState = RemoteRoomReservationStatus.LOW;
        remoteData.reserver = AssignmentStatus.UNASSIGNED;
    }

    Memory.remoteData[remoteRoomName] = remoteData;
}

/**
 * Reassign idle protectors to needed room. If there are none check if a room has more than one protector and reassign one of them.
 *
 * @param controllingRoomName -
 * @param remoteRoomName -
 * @returns Boolean to check if a reassignment was possible
 */
function reassignIdleProtector(controllingRoomName: string, remoteRoomName: string): boolean {
    const protectors = Object.values(Game.creeps).filter(
        (creep) => creep.memory.room === controllingRoomName && creep.memory.role === Role.PROTECTOR && creep.ticksToLive > 200
    );

    if (controllingRoomName === remoteRoomName) {
        // Home Protection (reassign and still spawn default ones)
        protectors.forEach((protector) => (protector.memory.assignment = remoteRoomName));
        return false;
    }

    const idleProtector = protectors.find((creep) => Memory.remoteData[creep.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.SAFE);
    if (idleProtector) {
        idleProtector.memory.assignment = remoteRoomName;
        return true;
    }

    const duplicateProtector = protectors.find((protector, i) => protectors.indexOf(protector) !== i);
    if (duplicateProtector) {
        duplicateProtector.memory.assignment = remoteRoomName;
        return true;
    }
    return false;
}

export function convertOldRoomsToNew() {
    let myRooms = Object.keys(Memory.rooms).filter((roomName) => Game.rooms[roomName].controller?.my);

    myRooms.forEach((roomName) => {
        console.log(`Converting old rooms for ${roomName}`);

        if (!Memory.rooms[roomName].remoteMiningRooms) {
            Memory.rooms[roomName].remoteMiningRooms = [];
        }

        let oldRemoteRooms = Object.keys(Memory.rooms[roomName]['remoteAssignments']);
        console.log(`old rooms found ${oldRemoteRooms.length}`);
        oldRemoteRooms?.forEach((oldRemoteRoomName) => {
            let oldRemoteData = Memory.rooms[roomName]['remoteAssignments'][oldRemoteRoomName];
            let newRemoteData: RemoteData;

            let miningPositions = Object.keys(oldRemoteData.miners);
            newRemoteData = {
                miningPositions: miningPositions,
                miner: AssignmentStatus.UNASSIGNED,
                gatherer: oldRemoteData.gatherer,
                threatLevel: RemoteRoomThreatLevel.SAFE,
                reservationState: RemoteRoomReservationStatus.LOW,
                reserver: AssignmentStatus.UNASSIGNED,
            };

            Memory.remoteData[oldRemoteRoomName] = newRemoteData;
            Memory.rooms[roomName].remoteMiningRooms.push(oldRemoteRoomName);
        });
    });

    console.log(`Run this next: \nrequire('memoryManagement).validateAssignments();`);
}

export function clearAllRemoteRoomAssignments() {
    let myRooms = Object.keys(Memory.rooms).filter((roomName) => Game.rooms[roomName].controller?.my);

    myRooms.forEach((room) => {
        Memory.rooms[room].remoteMiningRooms = [];
    });
}

export function dedupeRemoteRooms() {
    let myRooms = Object.keys(Memory.rooms).filter((roomName) => Game.rooms[roomName].controller?.my);

    myRooms.forEach((room) => {
        if (Memory.rooms[room].remoteMiningRooms?.length) {
            Memory.rooms[room].remoteMiningRooms = Array.from(new Set<string>(Memory.rooms[room].remoteMiningRooms));
        }
    });
}
