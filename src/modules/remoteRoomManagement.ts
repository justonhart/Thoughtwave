import { CombatIntel } from './combatIntel';
import { isKeeperRoom as isKeeperRoom } from './data';
import { PopulationManagement } from './populationManagement';
import { deleteRoad, getRoad, storeRoadInMemory } from './roads';
import { getStoragePos } from './roomDesign';

export function manageRemoteRoom(controllingRoomName: string, remoteRoomName: string) {
    let remoteRoom = Game.rooms[remoteRoomName];
    if (remoteRoom) {
        // Store Lairs and avoid them if possible
        if (
            isKeeperRoom(remoteRoomName) &&
            (!Memory.remoteData[remoteRoomName].sourceKeeperLairs ||
                Object.values(Memory.remoteData[remoteRoomName].sourceKeeperLairs).some((lair) => !lair.pos))
        ) {
            const lairData = createKeeperLairData(remoteRoomName);
            Memory.remoteData[remoteRoomName].sourceKeeperLairs = lairData;
            overridePreviousRoad(controllingRoomName, remoteRoomName);
        }
        Memory.remoteData[remoteRoomName].threatLevel = monitorThreatLevel(remoteRoom);
    }

    // Repopulate road data if necessary
    Object.entries(Memory.rooms[controllingRoomName].remoteSources)
        .filter(([remoteSourcePos, remoteSource]) => !Memory.roomData[remoteRoomName].roads)
        .forEach(([remoteSourcePos, remoteSource]) => {
            const storagePos = getStoragePos(Game.rooms[controllingRoomName]);
            const road = getRoad(storagePos, remoteSource.miningPos.toRoomPos(), {
                allowedStatuses: [RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.VACANT],
                ignoreOtherRoads: false,
                destRange: 1,
            });

            if (road.incomplete) {
                return;
            }

            const result = storeRoadInMemory(storagePos, remoteSource.miningPos.toRoomPos(), road.path);
            if (result !== OK) {
                console.log('problem recreating road to source in memory');
                return ERR_INVALID_ARGS;
            }
        });

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

function createKeeperLairData(remoteRoomName: string): { [id: Id<Source> | Id<Mineral>]: { id: Id<StructureKeeperLair>; pos: string } } {
    const lairs = {};
    Game.rooms[remoteRoomName]
        .find(FIND_HOSTILE_STRUCTURES, {
            filter: (s) => s.structureType === STRUCTURE_KEEPER_LAIR,
        })
        .forEach((lair) => {
            const source = lair.pos.findClosestByRange(FIND_SOURCES);
            if (lair.pos.getRangeTo(source) < 6) {
                lairs[source.pos.toMemSafe()] = { id: lair.id, pos: lair.pos.toMemSafe() };
            } else {
                const mineral = lair.pos.findClosestByRange(FIND_MINERALS);
                lairs[mineral.pos.toMemSafe()] = { id: lair.id, pos: lair.pos.toMemSafe() };
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

function overridePreviousRoad(controllingRoomName: string, remoteRoomName: string) {
    const sourceKeeperLairs = Memory.remoteData[remoteRoomName].sourceKeeperLairs;
    if (!sourceKeeperLairs || Object.keys(sourceKeeperLairs).length === 0) {
        return;
    }
    const storagePos = getStoragePos(Game.rooms[controllingRoomName]);
    Object.keys(sourceKeeperLairs)
        .filter((sourcePos) => Memory.remoteSourceAssignments[sourcePos])
        .forEach((sourcePos) => {
            try {
                const miningPos = Memory.rooms[controllingRoomName].remoteSources[sourcePos].miningPos;
                const road = getRoad(storagePos, miningPos.toRoomPos(), {
                    allowedStatuses: [RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.VACANT],
                    ignoreOtherRoads: false,
                    destRange: 1,
                });

                if (road.incomplete) {
                    return;
                }
                deleteRoad(`${storagePos.toMemSafe()}:${miningPos}`);
                const result = storeRoadInMemory(storagePos, miningPos.toRoomPos(), road.path);
                if (result !== OK) {
                    console.log('problem overriding road to source in memory');
                    return ERR_INVALID_ARGS;
                }
            } catch (e) {
                console.log(`Caught error calculating road around Lairs: ${e}`);
                return;
            }
        });
}
