import { getStoragePos } from './roomDesign';

export function manageRemoteRoom(controllingRoomName: string, remoteRoomName: string) {
    let remoteRoom = Game.rooms[remoteRoomName];
    if (remoteRoom) {
        Memory.remoteData[remoteRoomName].threatLevel = monitorThreatLevel(remoteRoom);
    }
}

function monitorThreatLevel(room: Room) {
    let creeps = room.find(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username !== 'Source Keeper' });
    return creeps.some((c) => c.getActiveBodyparts('attack') + c.getActiveBodyparts('ranged_attack') > 0)
        ? RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS
        : creeps.length
        ? RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS
        : RemoteRoomThreatLevel.SAFE;
}

function spawnProtector(homeRoomName: string, remoteRoomName: string, body: BodyPartConstant[]) {
    Memory.spawnAssignments.push({
        designee: homeRoomName,
        body: body,
        spawnOpts: {
            memory: {
                role: Role.PROTECTOR,
                room: homeRoomName,
                assignment: remoteRoomName,
                currentTaskPriority: Priority.MEDIUM,
                combat: { flee: false },
            },
        },
    });
}

/**
 * Calculate protector body depending on enemy numbers and body composition.
 * @param hostileCreeps -
 * @returns
 */
function getMaxProtectorBodySize(hostileCreeps: Creep[], healerCreeps: Creep[]) {
    const maxBodySize = 24; // Default max Body size (not 25 since all protectors have heal/move default parts)
    if (hostileCreeps?.length === 1 && !healerCreeps?.length) {
        let additionalBodySize = 2; // Adding extra body parts to gain advantage over the enemy
        if (hostileCreeps[0].body.some((creepBody) => creepBody.boost)) {
            additionalBodySize = 4;
        }
        const calculatedMaxBodySize = hostileCreeps[0].getActiveBodyparts(RANGED_ATTACK) + additionalBodySize;
        return calculatedMaxBodySize > maxBodySize ? maxBodySize : calculatedMaxBodySize;
    }
    return maxBodySize;
}

export function addRemoteRoomAssignment(controllingRoomName: string, remoteRoomName: string) {
    let remoteRoom = Game.rooms[remoteRoomName];

    if (remoteRoom) {
        let miningPositions = findMiningPositions(controllingRoomName, remoteRoomName);

        if (isCentralRoom(remoteRoomName)) {
            let roomMemory: RemoteData = {
                miningPositions: miningPositions,
                threatLevel: RemoteRoomThreatLevel.SAFE,
                miner: AssignmentStatus.UNASSIGNED,
                hauler: AssignmentStatus.UNASSIGNED,
            };

            if (remoteRoom.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR })) {
                roomMemory.keeperExterminator = AssignmentStatus.UNASSIGNED;
            }

            Memory.remoteData[remoteRoomName] = roomMemory;
            Game.rooms[controllingRoomName].memory.remoteMiningRooms.push(remoteRoomName);
        } else {
            let roomMemory: RemoteData = {
                miningPositions: miningPositions,
                threatLevel: RemoteRoomThreatLevel.SAFE,
                miner: AssignmentStatus.UNASSIGNED,
                hauler: AssignmentStatus.UNASSIGNED,
                reserver: AssignmentStatus.UNASSIGNED,
                reservationState: RemoteRoomReservationStatus.LOW,
            };

            Memory.remoteData[remoteRoomName] = roomMemory;
            Game.rooms[controllingRoomName].memory.remoteMiningRooms.push(remoteRoomName);
        }
    } else {
        throw 'Remote room must be visible';
    }
}

function findMiningPositions(controllingRoomName: string, remoteRoomName: string): string[] {
    let controllingRoom = Game.rooms[controllingRoomName];
    let remoteRoom = Game.rooms[remoteRoomName];

    let harvestTargets: (Source | Mineral)[] = [...remoteRoom.find(FIND_SOURCES)];
    if (isCentralRoom(remoteRoomName)) {
        harvestTargets.push(...remoteRoom.find(FIND_MINERALS));
    }
    let miningPositions: string[] = [];

    harvestTargets.forEach((target) => {
        const path = PathFinder.search(getStoragePos(controllingRoom), { pos: target.pos, range: 1 });
        if (!path.incomplete) {
            miningPositions.push(path.path.pop().toMemSafe());
        }
    });

    return miningPositions;
}

function isCentralRoom(roomName: string) {
    return roomName
        .replace(/[EW]/, '')
        .replace(/[NS]/, '.')
        .split('.')
        .map((num) => parseInt(num) % 10 >= 4 && parseInt(num) % 10 <= 6)
        .reduce((last, next) => last && next);
}
