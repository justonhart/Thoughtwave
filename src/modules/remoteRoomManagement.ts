export function manageRemoteRoom(remoteRoomName: string) {}

function runSecurity(homeRoom: Room, remoteRoomName: string) {}

function spawnProtector(homeRoomName: string, remoteRoomName: string, body: BodyPartConstant[]) {
    Memory.empire.spawnAssignments.push({
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

/**
 * Reassign idle protectors to needed room. If there are none check if a room has more than one protector and reassign one of them.
 *
 * @param homeRoomName -
 * @param targetRoomName -
 * @returns Boolean to check if a reassignment was possible
 */
function reassignIdleProtector(homeRoomName: string, targetRoomName: string): boolean {
    const protectors = Object.values(Game.creeps).filter(
        (creep) => creep.memory.room === homeRoomName && creep.memory.role === Role.PROTECTOR && creep.ticksToLive > 200
    );

    if (homeRoomName === targetRoomName) {
        // Home Protection (reassign and still spawn default ones)
        protectors.forEach((protector) => (protector.memory.assignment = targetRoomName));
        return false;
    }

    const idleProtector = protectors.find(
        (creep) => Memory.rooms[homeRoomName].remoteAssignments?.[creep.memory.assignment]?.state !== RemoteMiningRoomState.SAFE
    );
    if (idleProtector) {
        idleProtector.memory.assignment = targetRoomName;
        return true;
    }

    const duplicateProtector = protectors.find((protector, i) => protectors.indexOf(protector) !== i);
    if (duplicateProtector) {
        duplicateProtector.memory.assignment = targetRoomName;
        return true;
    }
    return false;
}
