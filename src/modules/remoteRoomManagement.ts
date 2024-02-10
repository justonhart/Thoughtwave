import { CombatIntel } from './combatIntel';
import { addVisionRequest, hasVisionRequest, isKeeperRoom as isKeeperRoom } from './data';
import { PopulationManagement } from './populationManagement';
import { deleteRoad, getRoad, storeRoadInMemory } from './roads';
import { getStoragePos } from './roomDesign';

/**
 * Operates similarly to regular remote room, but doesn't spawn reservers or protectors & uses half-sized miners, and consequently half gatherers that don't build roads
 * @param controllingRoomName
 * @param remoteRoomName
 */
export function manageEarlyRemoteRoom(controllingRoomName: string, remoteRoomName: string) {
    runEarlyThreatMonitoring(remoteRoomName);
}

function runEarlyThreatMonitoring(remoteRoomName: string) {
    let room = Game.rooms[remoteRoomName];
    if (room) {
        if (room.hostileCreeps.some((c) => c.body.some((part) => part.type === ATTACK || part.type === RANGED_ATTACK))) {
            Memory.remoteData[remoteRoomName].threatLevel = RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS;
            Memory.remoteData[remoteRoomName].threatReset = Game.time + 1500;
            Memory.remoteData[remoteRoomName].evacuate = true;
        } else {
            Memory.remoteData[remoteRoomName].threatLevel = RemoteRoomThreatLevel.SAFE;
            delete Memory.remoteData[remoteRoomName].threatReset;
            delete Memory.remoteData[remoteRoomName].evacuate;
        }
    } else if (Memory.remoteData[remoteRoomName].threatReset <= Game.time) {
        Memory.remoteData[remoteRoomName].threatLevel = RemoteRoomThreatLevel.SAFE;
        delete Memory.remoteData[remoteRoomName].threatReset;
        delete Memory.remoteData[remoteRoomName].evacuate;
    }
}

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
        } else {
            if (global.empireData.roomsOwned < global.empireData.roomCap && Memory.remoteData[remoteRoomName].shouldCheckStructures) {
                const reserver = Game.creeps[Memory.remoteData[remoteRoomName].reserver];
                if (
                    reserver &&
                    reserver.pos.isNearTo(remoteRoom.controller) &&
                    !Object.values(Memory.rooms).some((room) => room.roomType === RoomType.REMOTE_MINING)
                ) {
                    const structuresToClear = remoteRoom.structures.some(
                        (s) =>
                            s.structureType !== STRUCTURE_CONTROLLER &&
                            s.structureType !== STRUCTURE_CONTAINER &&
                            s.structureType !== STRUCTURE_ROAD &&
                            s.structureType !== STRUCTURE_INVADER_CORE
                    );
                    if (!structuresToClear) {
                        delete Memory.remoteData[remoteRoomName].shouldCheckStructures;
                    } else {
                        delete Memory.remoteData[remoteRoomName].shouldCheckStructures;
                        Memory.remoteData[remoteRoomName].clearStructures = true;
                    }
                }
            }
        }
        Memory.remoteData[remoteRoomName].threatLevel = monitorThreatLevel(remoteRoom);
    }

    // Repopulate road data if necessary
    if (Game.time % 250 === 0) {
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
    }

    const threatLevel = Memory.remoteData[remoteRoomName]?.threatLevel;
    if (
        Memory.roomData[remoteRoomName]?.roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
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
        Memory.roomData[remoteRoomName]?.roomStatus !== RoomMemoryStatus.OWNED_INVADER &&
        threatLevel >= RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS &&
        !PopulationManagement.hasProtector(remoteRoomName) &&
        !reassignIdleProtector(controllingRoomName, remoteRoomName)
    ) {
        // Add vision to remote room for better dynamic spawning (only waits one tick)
        if (!remoteRoom && !hasVisionRequest(remoteRoomName)) {
            addVisionRequest({ targetRoom: remoteRoomName });
            return;
        }

        let body: BodyPartConstant[];
        let boosts = [];
        if (remoteRoom) {
            if (threatLevel === RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS) {
                const highestHP = remoteRoom.hostileCreeps
                    .filter((creep) => !Memory.playersToIgnore?.includes(creep.owner.username) && creep.owner.username !== 'Source Keeper')
                    .reduce((highestHP, nextCreep) => (highestHP < nextCreep.hitsMax ? nextCreep.hitsMax : highestHP), 0);
                body = PopulationManagement.createDynamicCreepBody(Game.rooms[controllingRoomName], [ATTACK, MOVE], Math.ceil(highestHP / 10), 1);
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
                    1 + combatIntel.totalRanged,
                    { boosts: boosts }
                );
            }
        } else {
            body = PopulationManagement.createPartsArray([RANGED_ATTACK, MOVE], Game.rooms[controllingRoomName].energyCapacityAvailable - 300, 6);
            body.push(HEAL, MOVE);
        }

        // TODO: Combat update spawn multiple creeps if necessary
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
    const creeps = room.hostileCreeps.filter((c) => c.owner.username !== 'Source Keeper');

    const currentThreatLevel = Memory.remoteData[room.name]?.threatLevel;

    if (
        currentThreatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS &&
        room.getEventLog().some((e) => e.event === EVENT_ATTACK && !Game.getObjectById(e.objectId as Id<Creep>)?.my)
    ) {
        Memory.remoteData[room.name].evacuate = true;
    } else if (currentThreatLevel < RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS && Memory.remoteData[room.name].evacuate) {
        Memory.remoteData[room.name].evacuate = false;
    }

    let hasInvaderCore = currentThreatLevel === RemoteRoomThreatLevel.INVADER_CORE;
    if (currentThreatLevel < RemoteRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS && Game.time % 3 === 0) {
        // No need to check for this every tick in every remote room
        hasInvaderCore = !!room.hostileStructures.some((s) => s.structureType === STRUCTURE_INVADER_CORE);
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
    Game.rooms[remoteRoomName].hostileStructures
        .filter((s) => s.structureType === STRUCTURE_KEEPER_LAIR)
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
 * TODO: remove or adjust to check if idleProtector is strong enough to handle threat
 *
 * @param controllingRoomName -
 * @param remoteRoomName -
 * @returns Boolean to check if a reassignment was possible
 */
function reassignIdleProtector(controllingRoomName: string, remoteRoomName: string): boolean {
    return false;
    const protectors = Game.rooms[controllingRoomName].myCreepsByMemory.filter(
        (creep) => creep.memory.role === Role.PROTECTOR && creep.ticksToLive > 200
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
