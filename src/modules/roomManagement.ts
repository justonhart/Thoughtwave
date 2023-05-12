import { CombatIntel } from './combatIntel';
import { computeRoomNameFromDiff, isCenterRoom, isKeeperRoom } from './data';
import { addLabTask, runLabs } from './labManagement';
import { PopulationManagement } from './populationManagement';
import { assignRemoteSource, findSuitableRemoteSource, removeSourceAssignment } from './remoteMining';
import { manageRemoteRoom } from './remoteRoomManagement';
import { shipmentReady } from './resourceManagement';
import { deleteRoad } from './roads';
import {
    placeBunkerOuterRamparts,
    placeBunkerConstructionSites,
    placeMinerLinks,
    placeRoadsToPOIs,
    cleanRoom,
    placeBunkerInnerRamparts,
    placeBunkerCoreRamparts,
    roomNeedsCoreStructures,
    placeUpgraderLink,
    findStampLocation,
} from './roomDesign';

const BUILD_CHECK_PERIOD = 100;
const REPAIR_QUEUE_REFRESH_PERIOD = 500;
const RESOURCE_COMPRESSION_MAP = {
    [RESOURCE_UTRIUM]: RESOURCE_UTRIUM_BAR,
    [RESOURCE_LEMERGIUM]: RESOURCE_LEMERGIUM_BAR,
    [RESOURCE_ZYNTHIUM]: RESOURCE_ZYNTHIUM_BAR,
    [RESOURCE_KEANIUM]: RESOURCE_KEANIUM_BAR,
    [RESOURCE_GHODIUM]: RESOURCE_GHODIUM_MELT,
    [RESOURCE_OXYGEN]: RESOURCE_OXIDANT,
    [RESOURCE_HYDROGEN]: RESOURCE_REDUCTANT,
    [RESOURCE_CATALYST]: RESOURCE_PURIFIER,
    [RESOURCE_ENERGY]: RESOURCE_BATTERY,
};

export function driveRoom(room: Room) {
    if (room.memory?.unclaim) {
        delete Memory.rooms[room.name];
        return;
    }

    if (!Memory.rooms[room.name] || Object.keys(Memory.rooms[room.name])?.length === 0) {
        initRoom(room);
    } else {
        initMissingMemoryValues(room);
    }

    setThreatLevel(room);

    if (!room.canSpawn()) {
        // fail state - if a room has unexpectedly lost all spawns
    } else {
        room.memory.reservedEnergy = 0;

        let nukes = room.find(FIND_NUKES);
        if (room.controller.level >= 6 && nukes.length && getStructuresToProtect(nukes)?.length) {
            let structuresAtRisk = getStructuresToProtect(nukes);
            structuresAtRisk.forEach((structureId) => {
                let structure = Game.getObjectById(structureId);
                room.visual.circle(structure.pos, { opacity: 1, strokeWidth: 0.8, stroke: '#f44336' });
                if (structure && !structure?.getRampart()) {
                    let constructionSite = structure?.pos.lookFor(LOOK_CONSTRUCTION_SITES).pop();
                    if (constructionSite?.structureType !== STRUCTURE_RAMPART) {
                        constructionSite?.remove();
                        structure.pos.createConstructionSite(STRUCTURE_RAMPART);
                    }
                }
            });
        } else {
            if (room.memory.repairSearchCooldown > 0) {
                room.memory.repairSearchCooldown--;
            }

            if (Game.time % REPAIR_QUEUE_REFRESH_PERIOD === 0) {
                room.memory.repairQueue = findRepairTargets(room);
                room.memory.needsWallRepair =
                    room.find(FIND_STRUCTURES, {
                        filter: (s) =>
                            (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < room.getDefenseHitpointTarget(),
                    }).length > 0;
            }

            if (room.memory.repairQueue.length) {
                room.memory.repairQueue.forEach((job) => {
                    let pos = Game.getObjectById(job)?.pos;
                    room.visual.text('🛠', pos);
                });
            }

            if (
                room.memory.layout === RoomLayout.BUNKER &&
                Game.cpu.bucket > 200 &&
                !global.roomConstructionsChecked &&
                (room.memory.dontCheckConstructionsBefore ?? 0) < Game.time &&
                (room.energyStatus >= EnergyStatus.RECOVERING || room.energyStatus === undefined) &&
                Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES &&
                room.find(FIND_MY_CONSTRUCTION_SITES).length < 15
            ) {
                let cpuUsed = Game.cpu.getUsed();
                switch (room.controller.level) {
                    case 8:
                        if (!roomNeedsCoreStructures(room)) {
                            placeBunkerCoreRamparts(room);
                        }
                    case 7:
                        placeUpgraderLink(room);
                    case 6:
                        if (!roomNeedsCoreStructures(room)) {
                            placeBunkerInnerRamparts(room);
                        }
                        placeExtractor(room);
                        placeMineralContainers(room);
                    case 5:
                        placeMinerLinks(room);
                    case 4:
                        if (!roomNeedsCoreStructures(room)) {
                            placeBunkerOuterRamparts(room);
                            placeMiningRamparts(room);
                        }
                    case 3:
                        placeMiningPositionContainers(room);
                    case 2:
                        placeBunkerConstructionSites(room);
                        placeRoadsToPOIs(room);
                    case 1:
                        cleanRoom(room);
                }
                global.roomConstructionsChecked = true;
                room.memory.dontCheckConstructionsBefore = Game.time + BUILD_CHECK_PERIOD;
                cpuUsed = Game.cpu.getUsed() - cpuUsed;
                if (Memory.debug.logRoomPlacementCpu) {
                    console.log(`CPU used on ${room.name} bunker layout: ${cpuUsed}`);
                }
            }

            if (
                room.memory.layout === RoomLayout.STAMP &&
                !global.roomConstructionsChecked &&
                (room.memory.dontCheckConstructionsBefore ?? 0) < Game.time &&
                (room.energyStatus >= EnergyStatus.RECOVERING || room.energyStatus === undefined) &&
                Object.keys(Game.constructionSites).length < MAX_CONSTRUCTION_SITES &&
                room.find(FIND_MY_CONSTRUCTION_SITES).length < 15 &&
                !room.memory.colonizationInProgress
            ) {
                let cpuUsed = 0;
                // Cleanup any leftover storage/terminal that is in the way
                if (
                    room.memory.stampLayout.spawn.some(
                        (spawnStamp) =>
                            spawnStamp.rcl <= room.controller.level &&
                            !room
                                .lookAt(spawnStamp.pos.toRoomPos())
                                .some(
                                    (lookObj) =>
                                        lookObj.constructionSite?.structureType === spawnStamp.type ||
                                        lookObj.structure?.structureType === spawnStamp.type
                                )
                    )
                ) {
                    if (room.storage) {
                        const destroyStorage = Object.values(room.memory.stampLayout).some((stamps: StampDetail[]) =>
                            stamps.some((stamp) => stamp.rcl < 4 && stamp.pos === room.storage.pos.toMemSafe())
                        );
                        if (destroyStorage) {
                            room.storage.destroy();
                        }
                    }
                    if (room.terminal) {
                        const destroyTerminal = Object.values(room.memory.stampLayout).some((stamps: StampDetail[]) =>
                            stamps.some((stamp) => stamp.rcl < 4 && stamp.pos === room.terminal.pos.toMemSafe())
                        );
                        if (destroyTerminal) {
                            room.terminal.destroy();
                        }
                    }
                }

                // Cleanup left over storage/terminal
                if (room.controller.level > 3 && room.storage && !room.storage?.my) {
                    room.storage.destroy();
                }
                if (room.controller.level > 3 && room.terminal && !room.terminal?.my) {
                    room.terminal.destroy();
                }

                // Check for any missing structures and add them
                const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
                let constructionSitesCount = constructionSites.length;
                if (constructionSitesCount < 15) {
                    const structures = room.find(FIND_STRUCTURES);
                    const constructionStamps: { pos: RoomPosition; key: StructureConstant }[] = [];
                    // Check against all structures and construction sites currently in the room. If a stamp is not in either then add it as a construction site
                    Object.entries(room.memory.stampLayout)
                        .filter(([key, stamps]: [string, StampDetail[]]) => key !== 'managers')
                        .forEach(([key, stamps]: [string, StampDetail[]]) => {
                            stamps
                                .filter(
                                    (stamp) =>
                                        stamp.rcl <= room.controller.level &&
                                        !structures.some((structure) => key === structure.structureType && stamp.pos === structure.pos.toMemSafe()) &&
                                        !constructionSites.some(
                                            (structure) => key === structure.structureType && stamp.pos === structure.pos.toMemSafe()
                                        )
                                )
                                .forEach((stamp) => constructionStamps.push({ pos: stamp.pos.toRoomPos(), key: key as StructureConstant }));
                        });
                    constructionStamps.sort((a, b) => {
                        return getStructurePriority(a.key) > getStructurePriority(b.key) ? 1 : -1;
                    });
                    while (constructionStamps?.length && constructionSitesCount < 15) {
                        const nextConstructionSite = constructionStamps.pop();
                        const result = room.createConstructionSite(nextConstructionSite.pos, nextConstructionSite.key);
                        if (result !== OK) {
                            console.log(
                                `Could not createConstruction for Stamp layout in room ${room.name}. Result: ${result}. Type: ${
                                    nextConstructionSite.key
                                }. Position: ${nextConstructionSite.pos.toMemSafe()}`
                            );
                        }
                        constructionSitesCount++;
                    }
                }

                global.roomConstructionsChecked = true;
                room.memory.dontCheckConstructionsBefore = Game.time + BUILD_CHECK_PERIOD;
                cpuUsed = Game.cpu.getUsed() - cpuUsed;
                if (Memory.debug.logRoomPlacementCpu) {
                    console.log(`CPU used on ${room.name} stamp layout: ${cpuUsed}`);
                }
            }
        }

        let isHomeUnderAttack = false;
        try {
            isHomeUnderAttack = runHomeSecurity(room);
            runTowers(room, isHomeUnderAttack);
        } catch (e) {
            console.log(`Error caught running runHomeSecurity/runTowers in ${room.name}: \n${e}`);
        }

        if (room.memory.anchorPoint) {
            let anchorPoint = room.memory.anchorPoint.toRoomPos();
            if (
                anchorPoint
                    .findInRange(FIND_HOSTILE_CREEPS, 6)
                    .some(
                        (creep) =>
                            creep.owner.username !== 'Invader' &&
                            (creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK))
                    )
            ) {
                room.controller.activateSafeMode();
            }
        } else if (room.memory.layout === RoomLayout.STAMP) {
            if (
                room
                    .find(FIND_HOSTILE_CREEPS)
                    .some(
                        (creep) =>
                            creep.owner.username !== 'Invader' &&
                            (creep.getActiveBodyparts(WORK) || creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK)) &&
                            creep.pos.x > 2 &&
                            creep.pos.y > 2 &&
                            creep.pos.x < 47 &&
                            creep.pos.y < 47
                    )
            ) {
                room.controller.activateSafeMode();
            }
        }

        if (room.energyStatus >= EnergyStatus.RECOVERING) {
            //if this room doesn't have any outstanding claims
            if (
                Game.time % 1000 !== 0 &&
                !room.memory.outstandingClaim &&
                !room.memory.colonizationInProgress &&
                canSupportRemoteRoom(room) &&
                Game.time % 25 === 0 &&
                !global.remoteSourcesChecked &&
                Game.time - (room.memory.lastRemoteSourceCheck ?? 0) > 1000
            ) {
                try {
                    addRemoteSourceClaim(room);
                    room.memory.lastRemoteSourceCheck = Game.time;
                    global.remoteSourcesChecked = true;
                } catch (e) {
                    console.log(`Error caught running addRemoteSourceClaim in ${room.name}: \n${e}`);
                }
            }

            if (room.memory.outstandingClaim && Game.time % 1000 === 0) {
                try {
                    let result = executeRemoteSourceClaim(room);
                    if (result === OK) {
                        delete Memory.remoteSourceClaims[room.memory.outstandingClaim];
                        delete room.memory.outstandingClaim;
                    } else {
                        console.log(`Problem adding ${room.memory.outstandingClaim} as remote source assignment for ${room.name}`);
                    }
                } catch (e) {
                    console.log(`Error caught running executeRemoteSourceClaim in ${room.name}: \n${e}`);
                }
            }
        }

        if (room.observer) {
            let visionRequestId = room.memory.visionRequests?.find(
                (rq) => !Memory.visionRequests[rq].onTick || Memory.visionRequests[rq].onTick === Game.time + 1
            );
            if (visionRequestId) {
                try {
                    runVisionRequest(room, visionRequestId);
                } catch (e) {
                    console.log(`Error caught running room ${room.name} for Observer request: \n${e}`);
                }
            } else {
                try {
                    scanArea(room);
                } catch (e) {
                    console.log(`Error caught running room ${room.name} for Observer scanning: \n${e}`);
                }
            }
        }

        if (room.powerSpawn?.store.power >= 1 && room.powerSpawn?.store.energy >= 50 && room.energyStatus >= EnergyStatus.STABLE) {
            try {
                room.powerSpawn.processPower();
            } catch (e) {
                console.log(`Error caught running room ${room.name} for PowerSpawn: \n${e}`);
            }
        }

        try {
            runLabs(room);
        } catch (e) {
            console.log(`Error caught running room ${room.name} for Labs: \n${e}`);
        }

        if(!room.memory.colonizationInProgress){
            try {
                runSpawning(room);
            } catch (e) {
                console.log(`Error caught running room ${room.name} for Spawning: \n${e}`);
            }
        }

        if (room.factory) {
            try {
                runFactory(room);
            } catch (e) {
                console.log(`Error caught running room ${room.name} for Factory: \n${e}`);
            }
        }

        if (room.terminal) {
            try {
                runShipments(room);
            } catch (e) {
                console.log(`Error caught running room ${room.name} for Shipments: \n${e}`);
            }
        }

        if (!isHomeUnderAttack) {
            runRemoteRooms(room);
        }

        delete room.memory.reservedEnergy;
    }
}

function runTowers(room: Room, isRoomUnderAttack: boolean) {
    const towers = room.find(FIND_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_TOWER) as StructureTower[];

    const myHurtCreeps = room
        .find(FIND_MY_CREEPS)
        .filter(
            (creep) =>
                creep.hits < creep.hitsMax &&
                (!isRoomUnderAttack ||
                    creep.memory.role === Role.RAMPART_PROTECTOR ||
                    creep.memory.role === Role.DISTRIBUTOR ||
                    creep.memory.role === Role.WORKER)
        );
    if (myHurtCreeps.length) {
        const mostHurtCreep = myHurtCreeps.reduce((mostHurt, nextCreep) => (mostHurt.hits < nextCreep.hits ? mostHurt : nextCreep));

        // TODO: Optimize to only heal as much as needed
        if (mostHurtCreep) {
            towers.forEach((tower) => tower.heal(mostHurtCreep));
            return;
        }
    }

    if (!room.controller.safeMode) {
        const focus = Object.values(Game.creeps).find((creep) => creep.room.name === room.name && creep.memory.targetId2 && creep.memory.ready >= 5);
        if (focus) {
            towers.forEach((tower) => tower.attack(Game.getObjectById(focus.memory.targetId2)));
        } else {
            // Towers do not attack creeps on the edge because this can cause them to simply waste energy if two attackers are in the room and the healers go in and out of the room
            const hostileCreep = room.find(FIND_HOSTILE_CREEPS).find((creep) => {
                const hostileCreepInfo = CombatIntel.getCreepCombatData(room, true, creep.pos);
                const myCreepInfo = CombatIntel.getCreepCombatData(room, false, creep.pos);
                const myTowerInfo = CombatIntel.getTowerCombatData(room, false, creep.pos);
                return (
                    CombatIntel.getPredictedDamage(
                        myTowerInfo.dmgAtPos + myCreepInfo.totalDmg,
                        hostileCreepInfo.highestDmgMultiplier,
                        hostileCreepInfo.highestToughHits
                    ) > hostileCreepInfo.totalHeal && !Memory.playersToIgnore?.includes(creep.owner.username)
                );
            });
            if (hostileCreep) {
                towers.forEach((tower) => tower.attack(hostileCreep));
            }
        }
    }

    //if no defensive use for towers, repair roads
    if (room.controller.safeMode || !isRoomUnderAttack) {
        towers.forEach((tower) => {
            let repairQueue = room.memory.repairQueue;

            if (tower.store.energy > 600) {
                if (!room.memory.towerRepairMap[tower.id]) {
                    let roadId = repairQueue.find((id) => Game.getObjectById(id)?.structureType === STRUCTURE_ROAD) as Id<StructureRoad>;
                    room.memory.towerRepairMap[tower.id] = roadId;
                    room.removeFromRepairQueue(roadId);
                }

                let roadToRepair = Game.getObjectById(room.memory.towerRepairMap[tower.id]);

                if (roadToRepair?.hits < roadToRepair?.hitsMax) {
                    tower.repair(roadToRepair);
                } else {
                    delete room.memory.towerRepairMap[tower.id];
                }
            } else {
                delete room.memory.towerRepairMap[tower.id];
            }
        });
    }
}

function runHomeSecurity(homeRoom: Room): boolean {
    if (homeRoom.controller.safeMode) {
        return false;
    }

    const towerData = CombatIntel.getTowerCombatData(homeRoom, false);
    const hostileCreepData = CombatIntel.getCreepCombatData(homeRoom, true);

    if (hostileCreepData.totalHeal < towerData.minDmg * hostileCreepData.highestDmgMultiplier) {
        return false; // Towers can handle it for sure
    }

    if (
        homeRoom.memory.layout === RoomLayout.BUNKER &&
        hostileCreepData.totalHeal < CombatIntel.towerDamageAtRange(towerData, 12) * hostileCreepData.highestDmgMultiplier
    ) {
        return false; // Closest Creeps in BunkerLayout have to be in a range of 12 if they want to hit the ramparts in any way
    }

    // No Towers and/or ramparts yet so spawn a minimum protector with heal which can then kite the invader around
    if (hostileCreepData.creeps.length && homeRoom.controller.level < 4) {
        const currentNumProtectors = PopulationManagement.currentNumRampartProtectors(homeRoom.name);
        if (!currentNumProtectors) {
            Memory.spawnAssignments.push({
                designee: homeRoom.name,
                body: [RANGED_ATTACK, MOVE, MOVE, HEAL],
                spawnOpts: {
                    memory: {
                        role: Role.RAMPART_PROTECTOR,
                        room: homeRoom.name,
                        currentTaskPriority: Priority.MEDIUM,
                        combat: { flee: false },
                    },
                },
            });
        }
        return false;
    }

    const currentNumProtectors = PopulationManagement.currentNumRampartProtectors(homeRoom.name);
    if (hostileCreepData.creeps.length >= 1) {
        // Spawn multiple rampartProtectors based on the number of enemy hostiles
        if (
            !currentNumProtectors ||
            (hostileCreepData.creeps.length >= 4 &&
                currentNumProtectors + (hostileCreepData.creeps.length > 12 ? 1 : -1) - Math.floor(hostileCreepData.creeps.length / 4) < 0)
        ) {
            console.log(`Enemy Squad in homeRoom ${homeRoom.name}`);
            // Against squads we need two units (ranged for spread out dmg and melee for single target damage)
            const attackerBody = PopulationManagement.createPartsArray([ATTACK, ATTACK, ATTACK, ATTACK, MOVE], homeRoom.energyCapacityAvailable, 10);
            if (attackerBody.length) {
                Memory.spawnAssignments.push({
                    designee: homeRoom.name,
                    body: attackerBody,
                    spawnOpts: {
                        boosts: [BoostType.ATTACK],
                        memory: {
                            role: Role.RAMPART_PROTECTOR,
                            room: homeRoom.name,
                            assignment: homeRoom.name,
                            currentTaskPriority: Priority.HIGH,
                            combat: { flee: false },
                        },
                    },
                });
            }
        } else if (currentNumProtectors) {
            Memory.spawnAssignments
                .filter(
                    (creep) =>
                        creep.spawnOpts.memory.role === Role.RAMPART_PROTECTOR &&
                        creep.spawnOpts.memory.room === homeRoom.name &&
                        !creep.spawnOpts.memory.needsBoosted
                )
                .forEach((spawnAssignment) => {
                    spawnAssignment.spawnOpts.memory.needsBoosted = true;
                    spawnAssignment.spawnOpts.boosts = [BoostType.ATTACK, BoostType.MOVE];
                });
        }
        return true;
    } else if (!currentNumProtectors && hasEarlyDetectionThreat(homeRoom.name)) {
        // Spawn in early rampart protectors
        Game.notify(`Early detection system for Room ${homeRoom.name} detected at ${Game.time}!`);
        const attackerBody = PopulationManagement.createPartsArray([ATTACK, ATTACK, ATTACK, ATTACK, MOVE], homeRoom.energyCapacityAvailable, 10);
        Memory.spawnAssignments.push({
            designee: homeRoom.name,
            body: attackerBody,
            spawnOpts: {
                memory: {
                    role: Role.RAMPART_PROTECTOR,
                    room: homeRoom.name,
                    assignment: homeRoom.name,
                    currentTaskPriority: Priority.HIGH,
                    combat: { flee: false },
                },
            },
        });
    } else if (currentNumProtectors && !hasEarlyDetectionThreat(homeRoom.name)) {
        // Cleanup
        // Recycle unneeded creeps spawned in from early detection or any left over spawnAssignments
        Object.values(Game.creeps)
            .filter((creep) => creep.memory.role === Role.RAMPART_PROTECTOR && creep.pos.roomName === homeRoom.name)
            .forEach((creep) => (creep.memory.recycle = true));
        Memory.spawnAssignments = Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.role !== Role.RAMPART_PROTECTOR || creep.spawnOpts.memory.room !== homeRoom.name
        );
    }
    return false;
}

function hasEarlyDetectionThreat(roomName: string) {
    return Object.values(Game.map.describeExits(roomName)).some((exitRoomName) => Memory.roomData[exitRoomName].threatDetected);
}

export function initRoom(room: Room) {
    Memory.rooms[room.name] = {
        threatLevel: HomeRoomThreatLevel.SAFE,
        gates: [],
        repairSearchCooldown: 0,
        repairQueue: [],
        miningAssignments: {},
        mineralMiningAssignments: {},
        remoteSources: {},
        towerRepairMap: {},
        transferBuffer: {}
    };

    //calculate room layout here
    const valid = findStampLocation(room);
    if (valid) {
        room.memory.layout = RoomLayout.STAMP;
        const spawn = room.memory.stampLayout.spawn.find((spawnDetail) => spawnDetail.rcl === 1);
        room.createConstructionSite(spawn.pos.toRoomPos(), STRUCTURE_SPAWN);
        room.memory.miningAssignments = {};
        room.memory.stampLayout.container
            .filter((containerStamp) => containerStamp.type?.includes('source'))
            .forEach((minerStamp) => (room.memory.miningAssignments[minerStamp.pos] = AssignmentStatus.UNASSIGNED));
        room.memory.mineralMiningAssignments = {};
        room.memory.stampLayout.container
            .filter((containerStamp) => containerStamp.type === 'mineral')
            .forEach((mineralStamp) => (room.memory.mineralMiningAssignments[mineralStamp.pos] = AssignmentStatus.UNASSIGNED));
    }
}

function findMiningPostitions(room: Room) {
    let sources = room.find(FIND_SOURCES);
    let miningPositions = new Set<RoomPosition>();
    sources.forEach((source) => {
        let possiblePositions = room
            .lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
            .filter((terrain) => terrain.terrain != 'wall')
            .map((terrain) => new RoomPosition(terrain.x, terrain.y, source.room.name));

        //set closest position to storage as container position
        let anchorPoint = room.memory.anchorPoint.toRoomPos();
        let referencePos = anchorPoint ? new RoomPosition(anchorPoint.x + 1, anchorPoint.y - 1, room.name) : room.controller.pos;
        let candidate = referencePos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
        if (candidate) {
            miningPositions.add(candidate);
        }
    });

    // if a unique mining position was found for each source
    if (miningPositions.size === sources.length) {
        return Array.from(miningPositions);
    }

    return undefined;
}

function findMineralMiningPosition(room: Room): RoomPosition {
    let possiblePositions = room
        .lookForAtArea(LOOK_TERRAIN, room.mineral.pos.y - 1, room.mineral.pos.x - 1, room.mineral.pos.y + 1, room.mineral.pos.x + 1, true)
        .filter((terrain) => terrain.terrain != 'wall')
        .map((terrain) => new RoomPosition(terrain.x, terrain.y, room.mineral.room.name));

    //set closest position to storage as container position
    let anchorPoint = room.memory.anchorPoint.toRoomPos();
    let referencePos = anchorPoint ? new RoomPosition(anchorPoint.x + 1, anchorPoint.y - 1, room.name) : room.controller.pos;
    let candidate = referencePos.findClosestByPath(possiblePositions, { ignoreCreeps: true });
    if (candidate) {
        return candidate;
    }
}

function runSpawning(room: Room) {
    let spawns = Object.values(Game.spawns).filter((spawn) => spawn.room === room);

    let busySpawns = spawns.filter((spawn) => spawn.spawning);

    busySpawns.forEach((spawn) => {
        if (spawn.spawning.remainingTime <= 0) {
            let blockingCreeps = spawn.pos
                .findInRange(FIND_MY_CREEPS, 1)
                .filter(
                    (creep) => creep.memory.role !== Role.MANAGER && (!creep.memory.targetId || creep.memory.currentTaskPriority <= Priority.HIGH)
                );
            blockingCreeps.forEach((blocker) => {
                blocker.travelTo(spawn, { flee: true, range: 2 });
            });
        }
    });

    // Prioritize boosted spawns
    let availableSpawns = spawns
        .filter((spawn) => !spawn.spawning)
        .sort((spawn1, spawn2) => {
            if (spawn1.effects?.some((effect) => effect.effect === PWR_OPERATE_SPAWN)) {
                return 1;
            } else if (spawn2.effects?.some((effect) => effect.effect === PWR_OPERATE_SPAWN)) {
                return -1;
            } else {
                return 0;
            }
        });

    let roomCreeps = Object.values(Game.creeps).filter((creep) => creep.memory.room === room.name);
    let distributor = roomCreeps.find((creep) => creep.memory.role === Role.DISTRIBUTOR);
    let workerCount = roomCreeps.filter((creep) => creep.memory.role === Role.WORKER || creep.memory.role === Role.UPGRADER).length;
    let assignments = Memory.spawnAssignments.filter((assignment) => assignment.designee === room.name);

    if (distributor === undefined) {
        let spawn = availableSpawns.pop();
        spawn?.spawnDistributor();
    } else if (distributor.ticksToLive < 100) {
        //reserve energy & spawn for distributor
        availableSpawns.pop();
        room.memory.reservedEnergy += PopulationManagement.createPartsArray([CARRY, CARRY, MOVE], room.energyCapacityAvailable, 10)
            .map((part) => BODYPART_COST[part])
            .reduce((sum, next) => sum + next);
    }

    const roomUnderAttack = room.memory.threatLevel > HomeRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS && !room.controller.safeMode;
    if (roomUnderAttack) {
        let protectorAssignments = assignments.filter(
            (assignment) =>
                assignment.spawnOpts.memory.room === room.name &&
                (assignment.spawnOpts.memory.role === Role.RAMPART_PROTECTOR || assignment.spawnOpts.memory.role === Role.PROTECTOR)
        );
        protectorAssignments.forEach((assignment) => {
            let canSpawnAssignment = room.energyAvailable >= assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
            if (canSpawnAssignment) {
                let spawn = availableSpawns.pop();
                spawn?.spawnAssignedCreep(assignment);
            }
        });
    }

    if (PopulationManagement.needsTransporter(room) && !roomUnderAttack) {
        let options: SpawnOptions = {
            memory: {
                room: room.name,
                role: Role.TRANSPORTER,
            },
        };
        let spawn = availableSpawns.pop();
        spawn?.spawnMax([CARRY, CARRY, MOVE], PopulationManagement.generateName(options.memory.role, spawn.name), options, 10);
    }

    if (PopulationManagement.needsMiner(room) && (!roomUnderAttack || room.memory.layout === undefined)) {
        let spawn = availableSpawns.pop();
        spawn?.spawnMiner();
    }

    if (PopulationManagement.needsManager(room)) {
        if (room.memory.layout === RoomLayout.BUNKER) {
            const suitableSpawn = availableSpawns.find((spawn) => spawn.pos.isNearTo(room.memory.anchorPoint.toRoomPos()));
            if (suitableSpawn) {
                suitableSpawn.spawnManager();
                availableSpawns = availableSpawns.filter((spawn) => spawn !== suitableSpawn);
            }
        } else if (room.memory.layout === RoomLayout.STAMP) {
            // Look for spawn closest to new Manager if none found just spawn it
            const newManagerPos = PopulationManagement.getNewStampManager(room)?.pos;
            if (newManagerPos) {
                const suitableSpawn = availableSpawns.find((spawn) => spawn.pos.isNearTo(newManagerPos.toRoomPos()));
                if (suitableSpawn) {
                    suitableSpawn.spawnManager();
                    availableSpawns = availableSpawns.filter((spawn) => spawn !== suitableSpawn);
                } else {
                    let spawn = availableSpawns.pop();
                    spawn?.spawnManager();
                }
            }
        } else {
            let spawn = availableSpawns.pop();
            spawn?.spawnManager();
        }
    }

    if (PopulationManagement.needsMineralMiner(room) && !roomUnderAttack) {
        let spawn = availableSpawns.pop();
        spawn?.spawnMineralMiner();
    }

    if (workerCount >= room.workerCapacity && !roomUnderAttack) {
        assignments.forEach((assignment) => {
            const assignmentCost = assignment.body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost);
            const canSpawnAssignment = room.energyAvailable >= assignmentCost;
            let canSpawnSquad = true;
            // Optimize TTL for squads by only spawning them if both can be spawned at the same time (only enforced in max rooms due to energy concerns)
            if (room.controller.level >= 8 && assignment?.spawnOpts?.memory?.role === Role.SQUAD_ATTACKER) {
                const sameSquadAssignments = assignments.filter(
                    (otherAssignment) => otherAssignment.spawnOpts?.memory?.combat?.squadId === assignment.spawnOpts?.memory?.combat?.squadId
                );
                if (
                    sameSquadAssignments.length > 1 &&
                    (availableSpawns.length < 2 ||
                        room.energyAvailable <
                            sameSquadAssignments[1].body.map((part) => BODYPART_COST[part]).reduce((sum, cost) => sum + cost) + assignmentCost)
                ) {
                    canSpawnSquad = false;
                }
            }

            if (canSpawnAssignment && canSpawnSquad) {
                let spawn = availableSpawns.pop();
                spawn?.spawnAssignedCreep(assignment);
            }
        });

        if (room.energyStatus >= EnergyStatus.RECOVERING && room.remoteSources.length && !roomUnderAttack) {
            let exterminatorNeed = PopulationManagement.findExterminatorNeed(room);
            if (exterminatorNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnKeeperExterminator(exterminatorNeed);
            }

            let reserverNeed = PopulationManagement.findReserverNeed(room);
            if (reserverNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnReserver(reserverNeed);
            }

            let remoteMinerNeed = PopulationManagement.findRemoteMinerNeed(room);
            if (remoteMinerNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnRemoteMiner(remoteMinerNeed);
            }

            let gathererNeed = PopulationManagement.findGathererNeed(room);
            if (gathererNeed) {
                let spawn = availableSpawns.pop();
                spawn?.spawnGatherer(gathererNeed);
            }

            const remoteMineralMinerNeed = PopulationManagement.findRemoteMineralMinerNeed(room);
            if (remoteMineralMinerNeed) {
                const spawn = availableSpawns.pop();
                spawn?.spawnRemoteMineralMiner(remoteMineralMinerNeed);
            }
        }
    }

    availableSpawns.forEach((spawn) => {
        const result = spawn.spawnWorker(roomUnderAttack);
        if (result === undefined && !spawn.store.getFreeCapacity()) {
            // did not spawn any workers so check if we can renew managers
            const renewableManager = room.creeps.find(
                (creep) => creep.memory.role === Role.MANAGER && creep.ticksToLive < 1000 && spawn.pos.getRangeTo(creep) === 1
            );
            if (renewableManager) {
                spawn.renewCreep(renewableManager);
            }
        }
    });
}

export function findRepairTargets(room: Room): Id<Structure>[] {
    let repairTargetQueue: Id<Structure>[] = [];

    let damagedRoomStructures = room
        .find(FIND_STRUCTURES)
        .filter(
            (structure) =>
                structure.structureType !== STRUCTURE_WALL &&
                structure.structureType !== STRUCTURE_RAMPART &&
                structure.hits < (structure.structureType === STRUCTURE_ROAD ? structure.hitsMax * 0.9 : structure.hitsMax)
        );

    damagedRoomStructures.sort((structureA, structureB) => structureA.hits / structureA.hitsMax - structureB.hits / structureB.hitsMax);
    damagedRoomStructures.forEach((structure) => {
        repairTargetQueue.push(structure.id);
    });

    return repairTargetQueue;
}

function placeMiningPositionContainers(room: Room) {
    let miningPositions = Object.keys(room.memory.miningAssignments).map((pos) => pos.toRoomPos());
    miningPositions.forEach((pos) => {
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
    });
}

function placeMiningRamparts(room: Room) {
    let miningPositions = Object.keys(room.memory.miningAssignments).map((pos) => pos.toRoomPos());
    miningPositions.forEach((pos) => {
        room.createConstructionSite(pos.x, pos.y, STRUCTURE_RAMPART);
    });
}

function placeMineralContainers(room: Room) {
    if (!room.memory.mineralMiningAssignments || !Object.keys(room.memory.mineralMiningAssignments).length) {
        room.memory.mineralMiningAssignments = {};
        let mineralMiningPos = findMineralMiningPosition(room);
        room.memory.mineralMiningAssignments[mineralMiningPos.toMemSafe()] = AssignmentStatus.UNASSIGNED;
    }

    let miningPositions = Object.keys(room.memory.mineralMiningAssignments).map((pos) => pos.toRoomPos());
    miningPositions.forEach((pos) => {
        Game.rooms[pos.roomName]?.createConstructionSite(pos.x, pos.y, STRUCTURE_CONTAINER);
    });
}

function placeExtractor(room: Room) {
    let extractor = room.find(FIND_STRUCTURES).find((struct) => struct.structureType === STRUCTURE_EXTRACTOR);
    if (!extractor) {
        let mineralPos = room.mineral.pos;
        room.createConstructionSite(mineralPos, STRUCTURE_EXTRACTOR);
    }
}

export function getStructuresToProtect(nukes: Nuke[]) {
    let structuresToProtectWithHitAmounts = new Map<string, number>();

    nukes.forEach((nuke) => {
        let structuresAtRisk = nuke.room
            .lookForAtArea(LOOK_STRUCTURES, nuke.pos.y - 2, nuke.pos.x - 2, nuke.pos.y + 2, nuke.pos.x + 2, true)
            .filter((s) => s.structure.structureType !== STRUCTURE_ROAD && s.structure.structureType !== STRUCTURE_RAMPART);
        structuresAtRisk.forEach((look) => {
            structuresToProtectWithHitAmounts[look.structure.id]
                ? (structuresToProtectWithHitAmounts[look.structure.id] += look.structure.pos.isEqualTo(nuke.pos) ? 10000000 : 5000000)
                : (structuresToProtectWithHitAmounts[look.structure.id] = look.structure.pos.isEqualTo(nuke.pos) ? 10000000 : 5000000);
        });
    });

    let structureIds = Object.keys(structuresToProtectWithHitAmounts) as Id<Structure>[];
    let filteredStructuresToProtect = structureIds.filter(
        (structureId) =>
            !(
                Game.getObjectById(structureId)?.getRampart()?.hits >= structuresToProtectWithHitAmounts[structureId] ||
                Game.getObjectById(structureId)?.getRampart()?.hits === RAMPART_HITS_MAX[Game.getObjectById(structureId).room.controller.level]
            )
    );

    return filteredStructuresToProtect;
}

function runRemoteRooms(room: Room) {
    let remoteRooms = room.remoteMiningRooms;
    remoteRooms?.forEach((remoteRoomName) => {
        try {
            manageRemoteRoom(room.name, remoteRoomName);
        } catch (e) {
            console.log(`Error caught running remote room ${remoteRoomName}: \n${e}`);
        }
    });
}

function scanArea(room: Room) {
    let xDiff: number, yDiff: number;

    // Check all adjacent rooms if there hasnt been vision in 6 ticks to get early enemy detection
    const exitRoomName = Object.values(Game.map.describeExits(room.name)).find(
        (exitRoomName) =>
            Memory.roomData[exitRoomName]?.asOf <= Game.time + 6 &&
            ![RoomMemoryStatus.OWNED_OTHER, RoomMemoryStatus.OWNED_INVADER].some((status) => status === Memory.roomData[exitRoomName]?.roomStatus)
    );
    if (exitRoomName) {
        room.observer.observeRoom(exitRoomName);
        return;
    }
    if (room.memory.scanProgress === undefined || room.memory.scanProgress === '10.10') {
        //increment progress counter
        xDiff = -10;
        yDiff = -10;
    } else {
        let values = room.memory.scanProgress.split('.').map((s) => parseInt(s));

        if (values[1] === 10) {
            xDiff = values[0] + 1;
            yDiff = -10;
        } else {
            xDiff = values[0];
            yDiff = values[1] + 1;
        }
    }

    let scanTargetName = computeRoomNameFromDiff(room.name, xDiff, yDiff);

    //get visiblity
    room.observer.observeRoom(scanTargetName);
    room.memory.scanProgress = `${xDiff}.${yDiff}`;
}

function runVisionRequest(room: Room, requestId: string) {
    let result = room.observer.observeRoom(Memory.visionRequests[requestId].targetRoom);
    if (result === OK) {
        Memory.visionRequests[requestId].completed = true;
        room.memory.visionRequests = room.memory.visionRequests.filter((rq) => rq !== requestId);
    }
}

function getStructurePriority(structureType: StructureConstant): number {
    if (structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_CONTAINER || structureType === STRUCTURE_TERMINAL) {
        return 3;
    } else if (
        structureType === STRUCTURE_SPAWN ||
        structureType === STRUCTURE_EXTENSION ||
        structureType === STRUCTURE_TOWER ||
        structureType === STRUCTURE_LINK
    ) {
        return 2;
    } else if (structureType === STRUCTURE_ROAD) {
        return 1;
    } else if (structureType === STRUCTURE_RAMPART) {
        return -1;
    } else {
        return 0;
    }
}

export function canSupportRemoteRoom(room: Room) {
    return Object.keys(room.memory.remoteSources).length < room.find(FIND_MY_SPAWNS).length * 3 && !roomNeedsCoreStructures(room);
}

function initMissingMemoryValues(room: Room) {
    if (!room.memory.gates) {
        room.memory.gates = [];
    }

    if (!room.memory.repairQueue) {
        room.memory.repairQueue = [];
    }

    if (!room.memory.miningAssignments) {
        room.memory.miningAssignments = {};
    }

    if (!room.memory.mineralMiningAssignments) {
        room.memory.mineralMiningAssignments = {};
    }

    if (!room.memory.labTasks) {
        room.memory.labTasks = [];
    }

    if (!room.memory.shipments) {
        room.memory.shipments = [];
    }

    if (!room.memory.towerRepairMap) {
        room.memory.towerRepairMap = {};
    }

    if (!room.memory.visionRequests) {
        room.memory.visionRequests = [];
    }

    if (!room.memory.remoteSources) {
        room.memory.remoteSources = {};
    }

    if (!room.memory.resourceRequests) {
        room.memory.resourceRequests = [];
    }

    if(!room.memory.transferBuffer){
        room.memory.transferBuffer = {};
    }
}

export function addRemoteSourceClaim(room: Room) {
    let sourceToClaim = findSuitableRemoteSource(room.name);

    //if a room to claim is found, claim it if available and no closer claimant
    if (sourceToClaim) {
        let existingClaim = Memory.remoteSourceClaims[sourceToClaim.source];
        if (existingClaim) {
            if (existingClaim.estimatedIncome < sourceToClaim.stats.estimatedIncome) {
                Memory.remoteSourceClaims[sourceToClaim.source] = { claimant: room.name, estimatedIncome: sourceToClaim.stats.estimatedIncome };
                room.memory.outstandingClaim = sourceToClaim.source;
                delete Memory.rooms[existingClaim.claimant].outstandingClaim;
            }
        } else {
            Memory.remoteSourceClaims[sourceToClaim.source] = { claimant: room.name, estimatedIncome: sourceToClaim.stats.estimatedIncome };
            room.memory.outstandingClaim = sourceToClaim.source;
        }
    }

    return sourceToClaim;
}

export function executeRemoteSourceClaim(room: Room) {
    let result = assignRemoteSource(room.memory.outstandingClaim, room.name);
    if (result === OK) {
        delete Memory.remoteSourceClaims[room.memory.outstandingClaim];
        delete room.memory.outstandingClaim;
    } else {
        console.log(`Problem adding ${room.memory.outstandingClaim} as remote source assignment for ${room.name}`);
    }
    return result;
}

export function destructiveReset(roomName: string) {
    if (Game.rooms[roomName]?.controller?.my) {
        const room = Game.rooms[roomName];
        //unassign remote sources
        Object.keys(room.memory.remoteSources).forEach((source) => {
            removeSourceAssignment(source);
        });

        if (room.memory.outstandingClaim) {
            delete Memory.remoteSourceClaims[room.memory.outstandingClaim];
        }

        delete Memory.rooms[room.name];

        const structuresToDestroy = room.find(FIND_STRUCTURES, {
            filter: (s) => s.structureType !== STRUCTURE_SPAWN && s.structureType !== STRUCTURE_STORAGE && s.structureType !== STRUCTURE_EXTRACTOR,
        });

        let spawns = room.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_SPAWN });
        spawns.slice(1).forEach((spawn) => spawn.destroy());

        structuresToDestroy.forEach((struct) => struct.destroy());

        const creeps = Object.keys(Memory.creeps).filter((c) => Memory.creeps[c].room === room.name);
        creeps.forEach((c) => {
            if (Memory.creeps[c].role === Role.DISTRIBUTOR || Memory.creeps[c].role === Role.WORKER) {
                delete Memory.creeps[c].targetId;
                delete Memory.creeps[c].destination;
                delete Memory.creeps[c].energySource;
            } else {
                Memory.creeps[c] = {};
                Game.creeps[c].suicide();
            }
        });

        let roadsStartingHere = Object.keys(Memory.roomData[roomName].roads).filter(
            (roadKey) => roadKey.split(':')[0].toRoomPos().roomName === roomName
        );
        roadsStartingHere.forEach((road) => deleteRoad(road));
    }
}

function setThreatLevel(room: Room) {
    let threatLevel = HomeRoomThreatLevel.SAFE;
    const hostileCreeps = room.find(FIND_HOSTILE_CREEPS);
    if (hostileCreeps.length) {
        if (
            hostileCreeps.some(
                (creep) => creep.owner.username !== 'Invader' && (creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK))
            )
        ) {
            threatLevel = HomeRoomThreatLevel.ENEMY_ATTTACK_CREEPS;
            sendEmailOnAttack(room, hostileCreeps[0].owner.username);
        } else if (hostileCreeps.some((creep) => creep.owner.username !== 'Invader' && creep.getActiveBodyparts(WORK))) {
            threatLevel = HomeRoomThreatLevel.ENEMY_DISMANTLERS;
            sendEmailOnAttack(room, hostileCreeps[0].owner.username);
        } else if (hostileCreeps.some((creep) => creep.owner.username === 'Invader')) {
            threatLevel = HomeRoomThreatLevel.ENEMY_INVADERS;
        } else {
            threatLevel = HomeRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS;
        }
    }
    room.memory.threatLevel = threatLevel;
}

/**
 * Create Game notification when attacked by other players
 * @param room room that is being attacked
 * @param enemyUsername enemy player
 */
function sendEmailOnAttack(room: Room, enemyUsername: string) {
    if (room.memory.threatLevel <= HomeRoomThreatLevel.ENEMY_INVADERS) {
        Game.notify(`Room ${room.name} is under attack by ${enemyUsername} at ${Game.time}!`);
    }
}

function runFactory(room: Room) {
    let task = room.memory.factoryTask;
    let factory = room.factory;
    if (task) {
        if (!task.started) {
            if (factoryTaskReady(room)) {
                task.started = true;
            }
        } else {
            let materialsUsedUp: boolean = task.needs.some((need) => !factory.store[need.resource]);
            if (materialsUsedUp || factory.store[task.product] >= task.amount) {
                delete room.memory.factoryTask;
                if (Memory.debug?.logFactoryTasks) {
                    console.log(`${Game.time} - Factory task completed in ${room.name}`);
                }
            } else {
                if (!factory.cooldown) {
                    let result = factory.produce(task.product as CommodityConstant);
                    if (result !== OK) {
                        console.log(`Removing factory task because of err: ${result}`);
                        delete room.memory.factoryTask;
                    }
                }
            }
        }
    } else {
        const energyStatus = room.energyStatus;
        const batteryCount = room.getResourceAmount(RESOURCE_BATTERY);
        if (room.getResourceAmount(RESOURCE_ENERGY) > 375000 && batteryCount < 100000) {
            room.addFactoryTask(RESOURCE_BATTERY, 1500);
            return;
        } else if ((energyStatus <= EnergyStatus.SURPLUS && batteryCount > 100000) || (energyStatus <= EnergyStatus.STABLE && batteryCount >= 50)) {
            let setsOfFifty = Math.floor(batteryCount / 50);
            let energyToCreate = 10 * 50 * Math.min(40, setsOfFifty);
            room.addFactoryTask(RESOURCE_ENERGY, energyToCreate);
            return;
        }

        const resourceToDecompress = Object.values(RESOURCE_COMPRESSION_MAP)
            .filter((res) => res !== RESOURCE_BATTERY)
            .find(
                (resource) =>
                    room.storage.store[resource] >= 100 &&
                    room.terminal.store[Object.keys(RESOURCE_COMPRESSION_MAP).find((res) => RESOURCE_COMPRESSION_MAP[res] === resource)] < 5000
            );
        if (resourceToDecompress) {
            const product = Object.keys(RESOURCE_COMPRESSION_MAP).find((res) => RESOURCE_COMPRESSION_MAP[res] === resourceToDecompress);
            const resourceNeeded = 5000 - room.terminal.store[product];
            const amountOfBarsToDecompress = Math.min(
                Math.floor(resourceNeeded / 100) * 20,
                Math.floor(room.storage.store[resourceToDecompress] / 100) * 100,
                3000
            );
            if (Memory.debug?.logFactoryTasks) {
                console.log(`${Game.time} - Adding ${product} decompression task (${amountOfBarsToDecompress * 5}) in ${room.name}`);
            }
            room.addFactoryTask(product as ResourceConstant, amountOfBarsToDecompress * 5);
            return;
        }

        const resourceToCompress = Object.keys(MINERAL_MIN_AMOUNT).find(
            (resource) => room.storage.store[resource] > 20000 && room.terminal.store[resource] >= 5000
        );
        if (resourceToCompress) {
            const amountOfBarsToCreate = Math.floor(room.storage.store[resourceToCompress] / 500) * 100;
            room.addFactoryTask(RESOURCE_COMPRESSION_MAP[resourceToCompress], Math.min(amountOfBarsToCreate, 3000));
            return;
        }
    }
}

function factoryTaskReady(room: Room): boolean {
    return room.memory.factoryTask.needs.every((need) => need.amount <= 0);
}

export function getFactoryTaskReservedResourceAmount(room: Room, resource: ResourceConstant): number {
    return room.memory.factoryTask?.needs.find((need) => need.resource === resource)?.amount ?? 0;
}

export function getFactoryResourcesNeeded(task: FactoryTask): FactoryNeed[] {
    let needs: FactoryNeed[] = [];
    let commodityEntry: { amount: number; cooldown: number; components: { [resource: string]: number } } = COMMODITIES[task.product];
    let amountProduced = commodityEntry.amount;
    let componentResources = Object.keys(commodityEntry.components);
    let componentsAmounts = commodityEntry.components;

    needs = componentResources.map((resource) => {
        if (Memory.debug?.logFactoryTasks) {
            console.log(`Need: ${componentsAmounts[resource] * Math.floor(task.amount / amountProduced)} ${resource}`);
        }
        return { resource: resource as ResourceConstant, amount: componentsAmounts[resource] * Math.floor(task.amount / amountProduced) };
    });

    return needs;
}

function runShipments(room: Room) {
    room.memory.shipments = room.memory.shipments.filter(
        (shipmentId) => Memory.shipments[shipmentId] && ![ShipmentStatus.SHIPPED, ShipmentStatus.FAILED].includes(Memory.shipments[shipmentId].status)
    );

    let shipmentSentThisTick = false;
    room.memory.shipments.forEach((shipmentId) => {
        const shipment = Memory.shipments[shipmentId];

        //handle market order special case
        if (shipment.sender === shipment.recipient && shipment.marketOrderId) {
            switch (shipment.status) {
                case ShipmentStatus.QUEUED:
                    const canSupportShipment =
                        room.terminal.store.getCapacity() >
                        shipment.amount +
                            room.memory.shipments.reduce((resourcesSum, nextShipmentId) =>
                                [ShipmentStatus.PREPARING, ShipmentStatus.READY].includes(Memory.shipments[nextShipmentId].status)
                                    ? (resourcesSum += Memory.shipments[nextShipmentId].amount)
                                    : resourcesSum
                            );
                    if (canSupportShipment) {
                        if (Memory.debug.logShipments)
                            console.log(
                                `${Game.time} - ${shipment.sender} preparing for market order ${shipment.marketOrderId}: ${shipment.amount} ${shipment.resource}`
                            );
                        Memory.shipments[shipmentId].status = ShipmentStatus.PREPARING;
                    } else {
                        break;
                    }
                case ShipmentStatus.PREPARING:
                    if (shipmentReady(room.terminal, shipmentId)) {
                        if (Memory.debug.logShipments)
                            console.log(
                                `${Game.time} - ${shipment.sender} ready for market order ${shipment.marketOrderId}: ${shipment.amount} ${shipment.resource}`
                            );
                        Memory.shipments[shipmentId].status = ShipmentStatus.READY;
                    } else {
                        if (shipment.sender !== shipment.recipient && room.getResourceAmount(shipment.resource) < shipment.amount) {
                            if (Memory.debug.logShipments) {
                                console.log(`${Game.time} - Error preparing shipment ${shipmentId} in ${room.name}: not enough resource. Cancelling`);
                                shipment.status = ShipmentStatus.FAILED;
                            }
                        }
                        break;
                    }
                case ShipmentStatus.READY:
                    if (!shipmentSentThisTick && room.terminal.cooldown === 0) {
                        const result = Game.market.deal(shipment.marketOrderId, shipment.amount, shipment.recipient);
                        if (result === OK) {
                            if (Memory.debug.logShipments)
                                console.log(
                                    `${Game.time} - market order ${shipment.marketOrderId} executed: ${shipment.amount} ${shipment.resource} -> ${shipment.recipient}`
                                );
                            Memory.shipments[shipmentId].status = ShipmentStatus.SHIPPED;
                            shipmentSentThisTick = true;
                        }
                    }
                    break;
            }
        } else {
            switch (shipment.status) {
                case ShipmentStatus.QUEUED:
                    const canSupportShipment =
                        room.terminal.store.getCapacity() >
                        shipment.amount +
                            room.memory.shipments.reduce((resourcesSum, nextShipmentId) =>
                                [ShipmentStatus.PREPARING, ShipmentStatus.READY].includes(Memory.shipments[nextShipmentId].status)
                                    ? (resourcesSum += Memory.shipments[nextShipmentId].amount)
                                    : resourcesSum
                            );
                    if (canSupportShipment) {
                        if (Memory.debug.logShipments)
                            console.log(
                                `${Game.time} - Room preparing shipment: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`
                            );
                        Memory.shipments[shipmentId].status = ShipmentStatus.PREPARING;
                    } else {
                        break;
                    }
                case ShipmentStatus.PREPARING:
                    if (shipmentReady(room.terminal, shipmentId)) {
                        if (Memory.debug.logShipments)
                            console.log(
                                `${Game.time} - Shipment ready: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to  ${shipment.recipient}`
                            );
                        Memory.shipments[shipmentId].status = ShipmentStatus.READY;
                    } else {
                        break;
                    }
                case ShipmentStatus.READY:
                    const destinationReady = Game.rooms[shipment.recipient]?.controller.my
                        ? Game.rooms[shipment.recipient].terminal?.store.getFreeCapacity() >= shipment.amount
                        : true;
                    if (!shipmentSentThisTick && room.terminal.cooldown === 0 && destinationReady) {
                        const result = room.terminal.send(shipment.resource, shipment.amount, shipment.recipient);
                        if (result === OK) {
                            if (Memory.debug.logShipments)
                                console.log(
                                    `${Game.time} - Shipment sent: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`
                                );
                            Memory.shipments[shipmentId].status = ShipmentStatus.SHIPPED;
                            shipmentSentThisTick = true;
                        } else {
                            switch(result){
                                case ERR_NOT_ENOUGH_RESOURCES:
                                    console.log(
                                        `${Game.time} - Shipment FAILED: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient} - not enough resources to send`
                                    );
                                    Memory.shipments[shipmentId].status = ShipmentStatus.FAILED;
                                    break;
                                case ERR_INVALID_ARGS:
                                    console.log(
                                        `${Game.time} - Shipment FAILED: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient} - bad args`
                                    );
                                    Memory.shipments[shipmentId].status = ShipmentStatus.FAILED;
                                    break;
                                default:
                                    Memory.shipments[shipmentId].status = ShipmentStatus.FAILED;
                            }
                        }
                    }
                    break;
            }
        }
    });
}
