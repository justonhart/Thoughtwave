import { PopulationManagement } from './populationManagement';

export function driveRemoteRoom(room: Room) {
    if (room.memory.remoteAssignments) {
        try {
            Object.keys(room.memory.remoteAssignments).forEach((remoteRoomName) => {
                const remoteRoom = Game.rooms[remoteRoomName];
                if (remoteRoom) {
                    runSecurity(room, remoteRoom);
                }
            });
        } catch (e) {
            console.log(`Error caught in remote room management: \n${e}`);
        }
    }
}

function runSecurity(homeRoom: Room, targetRoom: Room) {
    const hostileAttackCreeps = targetRoom.find(FIND_HOSTILE_CREEPS, {
        filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
    });

    const hostileOtherCreeps = targetRoom.find(FIND_HOSTILE_CREEPS, {
        filter: (creep) => creep.getActiveBodyparts(ATTACK) === 0 && creep.getActiveBodyparts(RANGED_ATTACK) === 0,
    });

    if (hostileAttackCreeps.length || hostileOtherCreeps.length) {
        if (hostileOtherCreeps.length) {
            homeRoom.memory.remoteAssignments[targetRoom.name].state = RemoteMiningRoomState.ENEMY_NON_COMBAT_CREEPS;
        } else {
            homeRoom.memory.remoteAssignments[targetRoom.name].state = RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS;
        }

        if (PopulationManagement.needsProtector(targetRoom) && !reassignIdleProtector(homeRoom.name, targetRoom.name)) {
            const maxSize = hostileAttackCreeps.length ? getMaxSize(hostileAttackCreeps) : 6;
            const body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], homeRoom.energyCapacityAvailable - 300, maxSize);
            body.push(HEAL, MOVE);
            Memory.empire.spawnAssignments.push({
                designee: homeRoom.name,
                body: body,
                memoryOptions: {
                    role: Role.PROTECTOR,
                    room: homeRoom.name,
                    assignment: targetRoom.name,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { healing: false },
                },
            });
        }
        return;
    }

    const hostileStuctures = targetRoom.find(FIND_HOSTILE_STRUCTURES);
    if (hostileStuctures.length) {
        homeRoom.memory.remoteAssignments[targetRoom.name].state = RemoteMiningRoomState.ENEMY_STRUCTS;

        if (PopulationManagement.needsProtector(homeRoom) && !reassignIdleProtector(homeRoom.name, targetRoom.name)) {
            Memory.empire.spawnAssignments.push({
                designee: homeRoom.name,
                body: PopulationManagement.createPartsArray([ATTACK, MOVE], homeRoom.energyCapacityAvailable, 6),
                memoryOptions: {
                    role: Role.PROTECTOR,
                    room: homeRoom.name,
                    assignment: targetRoom.name,
                    currentTaskPriority: Priority.MEDIUM,
                    combat: { healing: false },
                },
            });
        }
        return;
    }

    homeRoom.memory.remoteAssignments[targetRoom.name].state = RemoteMiningRoomState.SAFE;
}

/**
 * Calculate protector body depending on enemy numbers and body composition.
 * @param hostileCreeps -
 * @returns
 */
function getMaxSize(hostileCreeps: Creep[]) {
    if (hostileCreeps.length === 1) {
        return hostileCreeps[0].getActiveBodyparts(RANGED_ATTACK) + 2;
    }
    return 24; // Default max Body size (not 25 since all protectors have heal/move default parts)
}

/**
 * Reassign idle protectors to needed room. If there are none check if a room has more than one protector and reassign one of them.
 *
 * @param homeRoomName -
 * @param targetRoomName -
 * @returns Boolean to check if a reassignment was possible
 */
function reassignIdleProtector(homeRoomName: string, targetRoomName: string): boolean {
    const protectors = Object.values(Memory.creeps).filter((creep) => creep.room === homeRoomName && creep.role === Role.PROTECTOR);

    const idleProtector = protectors.find((creep) => !creep.assignment);
    if (idleProtector) {
        idleProtector.assignment = targetRoomName;
        return true;
    }

    const duplicateProtector = protectors.find((protector, i) => protectors.indexOf(protector) !== i);
    if (duplicateProtector) {
        duplicateProtector.assignment = targetRoomName;
        return true;
    }
    return false;
}
