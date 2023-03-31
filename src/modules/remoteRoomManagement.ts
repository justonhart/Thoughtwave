import { CombatIntel } from './combatIntel';
import { isKeeperRoom as isKeeperRoom } from './data';
import { PopulationManagement } from './populationManagement';

export function manageRemoteRoom(controllingRoomName: string, remoteRoomName: string) {
    let remoteRoom = Game.rooms[remoteRoomName];
    if (remoteRoom) {
        if (isKeeperRoom(remoteRoomName) && !Memory.remoteData[remoteRoomName].sourceKeeperLairs) {
            Memory.remoteData[remoteRoomName].sourceKeeperLairs = createKeeperLairData(remoteRoomName);
        }
        Memory.remoteData[remoteRoomName].threatLevel = monitorThreatLevel(remoteRoom);
    }

    const threatLevel = Memory.remoteData[remoteRoomName].threatLevel;
    if (
        Memory.roomData[remoteRoomName].roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
        threatLevel === RemoteRoomThreatLevel.INVADER_CORE &&
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
        threatLevel >= RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS &&
        !PopulationManagement.hasProtector(remoteRoomName) &&
        !reassignIdleProtector(controllingRoomName, remoteRoomName)
    ) {
        let body: BodyPartConstant[];
        let boosts = [];
        if (remoteRoom) {
            if (threatLevel === RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS) {
                const highestHP = remoteRoom
                    .find(FIND_HOSTILE_CREEPS)
                    .filter((creep) => !Memory.playersToIgnore?.includes(creep.owner.username) && creep.owner.username !== 'Source Keeper')
                    .reduce((highestHP, nextCreep) => (highestHP < nextCreep.hitsMax ? nextCreep.hitsMax : highestHP), 0);
                body = PopulationManagement.createDynamicCreepBody(Game.rooms[controllingRoomName], [ATTACK, MOVE], Math.ceil(highestHP / 10), 0);
            } else {
                const combatIntel = CombatIntel.getCreepCombatData(remoteRoom, true);
                const dmgNeeded =
                    CombatIntel.getPredictedDamageNeeded(combatIntel.totalHeal, combatIntel.highestDmgMultiplier, combatIntel.highestToughHits) +
                    Math.ceil(combatIntel.highestHP / 25);
                if (threatLevel > RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS) {
                    if (combatIntel.totalRanged > 200) {
                        boosts.push(BoostType.TOUGH);
                    }
                    if (combatIntel.totalRanged >= 120) {
                        boosts.push(BoostType.HEAL);
                    }
                    if (dmgNeeded >= 180) {
                        boosts.push(BoostType.RANGED_ATTACK);
                    }
                }
                body = PopulationManagement.createDynamicCreepBody(
                    Game.rooms[controllingRoomName],
                    [RANGED_ATTACK, HEAL, MOVE, TOUGH],
                    dmgNeeded,
                    combatIntel.totalRanged,
                    { boosts: boosts }
                );
            }
        } else {
            body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], Game.rooms[controllingRoomName].energyCapacityAvailable - 300, 6);
            body.push(HEAL, MOVE);
        }

        // Cant beat enemy
        if (body.length === 50) {
            return;
        }
        Memory.spawnAssignments.push({
            designee: controllingRoomName,
            body: body,
            spawnOpts: {
                boosts: boosts,
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

export function calculateRemoteMinerWorkNeeded(roomName: string) {
    let data = Memory.roomData[roomName];
    let energyPotential = isKeeperRoom(roomName) ? 4000 * 3 : 3000;
    let workNeeded = energyPotential / (HARVEST_POWER * 300);

    return 1 + (workNeeded > 5 ? 7 : workNeeded);
}

function monitorThreatLevel(room: Room) {
    const creeps = room.find(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username !== 'Source Keeper' });

    const currentThreadLevel = Memory.remoteData[room.name].threatLevel;
    let hasInvaderCore = currentThreadLevel === RemoteRoomThreatLevel.INVADER_CORE;
    if (currentThreadLevel < RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS && Game.time % 3 === 0) {
        // No need to check for this every tick in every remote room
        hasInvaderCore = !!room.find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE }).length;
    }
    return creeps.some((c) => c.getActiveBodyparts(ATTACK) + c.getActiveBodyparts(RANGED_ATTACK) > 0)
        ? RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS
        : creeps.length
        ? RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS
        : hasInvaderCore
        ? RemoteRoomThreatLevel.INVADER_CORE
        : RemoteRoomThreatLevel.SAFE;
}

function createKeeperLairData(remoteRoomName: string): { [id: Id<Source> | Id<Mineral>]: Id<StructureKeeperLair> } {
    const lairs = {};
    Game.rooms[remoteRoomName]
        .find(FIND_HOSTILE_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR,
        })
        .forEach((lair) => {
            const source = lair.pos.findClosestByRange(FIND_SOURCES);
            if (lair.pos.getRangeTo(source) < 6) {
                lairs[source.pos.toMemSafe()] = lair.id;
            } else {
                const mineral = lair.pos.findClosestByRange(FIND_MINERALS);
                lairs[mineral.pos.toMemSafe()] = lair.id;
            }
        });
    return lairs;
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

export function removeRemoteRoomMemory(remoteRoomName: string) {
    delete Memory.remoteData[remoteRoomName];
    Memory.roomData[remoteRoomName].asOf = Game.time;
    Memory.roomData[remoteRoomName].roomStatus = RoomMemoryStatus.VACANT;
    delete Memory.roomData[remoteRoomName].owner;
}
