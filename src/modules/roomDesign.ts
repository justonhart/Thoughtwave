import { Pathing } from './pathing';

export function calculateRoomSpace(room: Room) {
    let totalWorkableSpace = 46 * 46;
    let walls = 0;

    for (let x = 2; x < 48; x++) {
        for (let y = 2; y < 48; y++) {
            let look = room.lookForAt(LOOK_TERRAIN, x, y);
            if (look.shift() === 'wall') {
                walls++;
            }
        }
    }

    console.log(`Wall ratio: ${walls / totalWorkableSpace}`);
}

export function getSpawnPos(room: Room): RoomPosition {
    return room.memory.stampLayout.spawn.find((spawnStamp) => spawnStamp.rcl === 1).pos.toRoomPos();
}

export function getStoragePos(room: Room): RoomPosition {
    return room.memory.stampLayout.storage[0].pos.toRoomPos();
}

export function findPoiAverage(room: Room) {
    let pois = room.find(FIND_SOURCES).map((source) => source.pos);
    pois.push(room.controller.pos);

    let pointOfInterestSum = { x: 0, y: 0 };
    pois.forEach((pos) => {
        pointOfInterestSum.x += pos.x;
        pointOfInterestSum.y += pos.y;
    });

    let pointOfInterestAverage = new RoomPosition(pointOfInterestSum.x / pois.length, pointOfInterestSum.y / pois.length, room.name);
    room.visual.text('🌟', pointOfInterestAverage);
    return pointOfInterestAverage;
}

// core structures are structures contained within auto-generated layouts: Spawns, storage, nuker, terminal, factory, extensions, labs, towers, observer
export function roomNeedsCoreStructures(room: Room) {
    let roomStructures = room.myStructures;
    let spawnCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_SPAWN).length;
    let extensionCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_EXTENSION).length;
    let storage = roomStructures.filter((structure) => structure.structureType === STRUCTURE_STORAGE).length;
    let nuker = roomStructures.filter((structure) => structure.structureType === STRUCTURE_NUKER).length;
    let terminal = roomStructures.filter((structure) => structure.structureType === STRUCTURE_TERMINAL).length;
    let factory = roomStructures.filter((structure) => structure.structureType === STRUCTURE_FACTORY).length;
    let labCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_LAB).length;
    let towerCount = roomStructures.filter((structure) => structure.structureType === STRUCTURE_TOWER).length;
    let managerLink = room.memory.managerLink;
    let observer = roomStructures.filter((structure) => structure.structureType === STRUCTURE_OBSERVER).length;
    let pSpawn = roomStructures.filter((structure) => structure.structureType === STRUCTURE_POWER_SPAWN).length;

    switch (room.controller.level) {
        case 1:
            return spawnCount < 1;
        case 2:
            return spawnCount < 1 || extensionCount < 5;
        case 3:
            return spawnCount < 1 || extensionCount < 10 || towerCount < 1;
        case 4:
            return spawnCount < 1 || extensionCount < 20 || towerCount < 1 || storage < 1;
        case 5:
            return spawnCount < 1 || extensionCount < 30 || towerCount < 2 || storage < 1 || !managerLink;
        case 6:
            return spawnCount < 1 || extensionCount < 40 || towerCount < 2 || storage < 1 || !managerLink || labCount < 3 || terminal < 1;
        case 7:
            return (
                spawnCount < 2 || extensionCount < 50 || towerCount < 3 || storage < 1 || !managerLink || labCount < 6 || terminal < 1 || factory < 1
            );
        case 8:
            return (
                spawnCount < 3 ||
                extensionCount < 60 ||
                towerCount < 6 ||
                storage < 1 ||
                !managerLink ||
                labCount < 10 ||
                terminal < 1 ||
                factory < 1 ||
                nuker < 1 ||
                pSpawn < 1 ||
                observer < 1
            );
        default:
            return false;
    }
}

//-----------------STAMP DESIGN----------------------------------------------------
const debug = false; // debug cpu usage
export function findStampLocation(room: Room, storeInMemory: boolean = true) {
    logCpu('Start');
    if (Game.cpu.bucket < Game.cpu.tickLimit - Game.cpu.limit) {
        console.log('CPU bucket is too low. Operation has been scheduled to run automatically once bucket is full enough.');
        global.nextTickFunctions = [
            () => {
                findStampLocation(room);
            },
        ];
        return;
    }
    const terrain = Game.map.getRoomTerrain(room.name);
    const poiAvg = findPoiAverage(room);
    let starCenter = new RoomPosition(poiAvg.x - 1, poiAvg.y + 1, room.name);
    const stamps = {
        extension: [],
        lab: [],
        storage: [],
        container: [],
        link: [],
        tower: [],
        observer: [],
        powerSpawn: [],
        rampart: [],
        road: [],
        managers: [],
        spawn: [],
        nuker: [],
        factory: [],
        terminal: [],
        extractor: [],
    } as Stamps;
    // 15 center extensions. If it goes above 20 then itll be in rcl 5
    let extensionCount = 15;
    let linkRcl = 6;
    // Block all available spots around sources for link and extension
    findBestMiningPostitions(room, terrain).forEach((bestSpot) => {
        addUniqueRoad(stamps, { type: `source${stamps.container.length}`, rcl: 3, pos: bestSpot.adjacentSpaces.shift().toMemSafe() });
        const linkPos = bestSpot.adjacentSpaces.shift();
        stamps.link.push({ type: `source${stamps.container.length}`, rcl: linkRcl, pos: linkPos.toMemSafe() });
        linkRcl++;
        bestSpot.adjacentSpaces.forEach((extensionPos) => {
            const rcl = extensionCount < 20 ? 4 : 5;
            stamps.extension.push({ type: `source${stamps.container.length}`, rcl, pos: extensionPos.toMemSafe() });
            extensionCount++;
        });
        stamps.container.push({ type: `source${stamps.container.length}`, rcl: 3, pos: bestSpot.pos.toMemSafe() });
    });

    let targetPositions = [];
    let roadPositions = [];
    setCenterPositions(starCenter, targetPositions, roadPositions);
    let valid =
        !hasWalls(terrain, targetPositions.concat(roadPositions)) &&
        !containsStamp(stamps, targetPositions) &&
        !containsNonRoadStamp(stamps, roadPositions);

    if (!valid) {
        for (let lookDistance = 1; lookDistance < 50; lookDistance++) {
            let lookPos: RoomPosition;
            let x: number, y: number;

            for (y = starCenter.y - lookDistance; y <= starCenter.y + lookDistance && !valid; y++) {
                for (x = starCenter.x - lookDistance; x <= starCenter.x + lookDistance && !valid; x++) {
                    if (y > starCenter.y - lookDistance && y < starCenter.y + lookDistance && x > starCenter.x - lookDistance) {
                        x = starCenter.x + lookDistance;
                    }

                    // since the square is 7 wide, the center must be at least 3 tiles away from edges (cant build on x/y = 0/49 or in front of exits)
                    if (x > 4 && x < 45 && y > 4 && y < 45) {
                        lookPos = new RoomPosition(x, y, starCenter.roomName);
                        targetPositions = [];
                        roadPositions = [];
                        setCenterPositions(lookPos, targetPositions, roadPositions);
                        valid =
                            !hasWalls(terrain, targetPositions.concat(roadPositions)) &&
                            !containsStamp(stamps, targetPositions) &&
                            !containsNonRoadStamp(stamps, roadPositions);
                    }
                    if (valid) {
                        starCenter = lookPos;
                        setCenterExtensions(stamps, starCenter);
                        roadPositions.forEach((pos: RoomPosition) => addUniqueRoad(stamps, { rcl: 3, pos: pos.toMemSafe() }));
                    }
                }
            }
        }
    } else {
        setCenterExtensions(stamps, starCenter);
        roadPositions.forEach((pos: RoomPosition) => addUniqueRoad(stamps, { rcl: 3, pos: pos.toMemSafe() }));
    }

    if (valid) {
        logCpu('Start bfs');
        valid = bfs(starCenter, stamps, terrain);
        logCpu('End bfs');
        if (!valid) {
            console.log('No proper placements found.');
            return false;
        }
        // Add roads to miningPositions, controller, minerals
        stamps.container
            .filter((stampDetail) => stampDetail.type?.includes('source'))
            .forEach((minerPoi) => addRoadToPois(minerPoi.pos.toRoomPos(), stamps, 3, minerPoi.type, terrain));
        stamps.extractor.push({ type: 'mineral', rcl: 6, pos: room.mineral.pos.toMemSafe() });
        addRoadToPois(room.mineral.pos, stamps, 6, 'mineral', terrain);

        // Add Ramparts
        const sections = getRampartSectionsAroundExits(stamps, terrain, room.name);
        sections.forEach((section) => {
            section.forEach((section) => {
                if (!containsNonRoadStamp(stamps, [section])) {
                    addUniqueRoad(stamps, { type: STRUCTURE_RAMPART, rcl: 4, pos: section.toMemSafe() });
                }
                stamps.rampart.push({ rcl: 4, pos: section.toMemSafe() });
            });
            addRoadToPois(section[Math.floor(section.length / 2)], stamps, 4, STRUCTURE_RAMPART, terrain);
        });

        // Add Ramparts on miners if necessary
        stamps.extension
            .filter(
                (extension) =>
                    extension.type?.includes('source') &&
                    stamps.rampart
                        .filter((rampart) => !rampart.type)
                        .some((exitRampart) => exitRampart.pos.toRoomPos().getRangeTo(extension.pos.toRoomPos()) < 3)
            )
            .forEach((minerExtension) => stamps.rampart.push({ rcl: 4, type: 'miner', pos: minerExtension.pos }));
        stamps.link
            .filter(
                (link) =>
                    link.type?.includes('source') &&
                    stamps.rampart
                        .filter((rampart) => !rampart.type)
                        .some((exitRampart) => exitRampart.pos.toRoomPos().getRangeTo(link.pos.toRoomPos()) < 3)
            )
            .forEach((minerLink) => stamps.rampart.push({ rcl: 4, type: 'miner', pos: minerLink.pos }));
        stamps.container
            .filter(
                (container) =>
                    container.type?.includes('source') &&
                    stamps.rampart
                        .filter((rampart) => !rampart.type)
                        .some((exitRampart) => exitRampart.pos.toRoomPos().getRangeTo(container.pos.toRoomPos()) < 3)
            )
            .forEach((minerContainer) => stamps.rampart.push({ rcl: 4, type: 'miner', pos: minerContainer.pos }));

        addRoadToPois(room.controller.pos, stamps, 3, STRUCTURE_CONTROLLER, terrain, 3);

        // Add left over single structures
        addSingleStructures(stamps, terrain, findExitAvg(sections));

        // Visualize
        drawLayout(Game.rooms[room.name].visual, stamps);

        // Store layout in memory
        if (storeInMemory) {
            room.memory.stampLayout = stamps;
        }
    }
    logCpu('End');
    return valid;
}

/**
 * Find the avg between all ramparts and put it outside of Boundary
 * @param sections all rampart placements for each exit section
 */
function findExitAvg(sections: RoomPosition[][]): RoomPosition {
    let exitSum = { x: 0, y: 0 };
    let count = 0;
    sections.forEach((section) => {
        section.forEach((section) => {
            exitSum.x += section.x;
            exitSum.y += section.y;
            count++;
        });
    });

    const x = exitSum.x / count;
    const y = exitSum.y / count;
    return new RoomPosition(x < 5 ? 5 : x > 44 ? 44 : x, y < 5 ? 5 : y > 44 ? 44 : y, sections[0][0].roomName);
}

/**
 * Adds ramparts around all exits and returns the center position for each section exit
 * @param stamps
 * @param terrain
 * @param roomName
 * @returns
 */
function getRampartSectionsAroundExits(stamps: Stamps, terrain: RoomTerrain, roomName: string): RoomPosition[][] {
    const leftExits = Game.rooms[roomName].find(FIND_EXIT_LEFT);
    const bottomExits = Game.rooms[roomName].find(FIND_EXIT_BOTTOM);
    const rightExits = Game.rooms[roomName].find(FIND_EXIT_RIGHT);
    const topExits = Game.rooms[roomName].find(FIND_EXIT_TOP);
    const rampartInfo = { ramparts: [], rampartsPerSection: [] };
    const exitPosPerSection = {};

    for (let i = 0; i < leftExits.length; i++) {
        const prevExit = i === 0 ? undefined : leftExits[i - 1];
        const currentExit = leftExits[i];
        const nextExit = i === leftExits.length - 1 ? undefined : leftExits[i + 1];

        // Opening Ramparts
        if (!rampartInfo.ramparts.length && (!prevExit || !currentExit.isNearTo(prevExit))) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(1, currentExit.y - 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(2, currentExit.y - 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(2, currentExit.y - 1, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }

        // Enclosing Ramparts
        if (
            terrain.get(3, currentExit.y - 1) !== TERRAIN_MASK_WALL ||
            terrain.get(3, currentExit.y) !== TERRAIN_MASK_WALL ||
            terrain.get(3, currentExit.y + 1) !== TERRAIN_MASK_WALL
        ) {
            setRampartIfNotWall(rampartInfo, terrain, new RoomPosition(2, currentExit.y, currentExit.roomName), exitPosPerSection, currentExit);
        } else {
            exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
            rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
            rampartInfo.ramparts = [];
        }

        // Closing Ramparts
        if (!nextExit || !currentExit.isNearTo(nextExit)) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(2, currentExit.y + 1, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(2, currentExit.y + 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(1, currentExit.y + 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }
    }

    for (let i = 0; i < bottomExits.length; i++) {
        const prevExit = i === 0 ? undefined : bottomExits[i - 1];
        const currentExit = bottomExits[i];
        const nextExit = i === bottomExits.length - 1 ? undefined : bottomExits[i + 1];

        // Opening Ramparts
        if (!rampartInfo.ramparts.length && (!prevExit || !currentExit.isNearTo(prevExit))) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x - 2, 48, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x - 2, 47, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x - 1, 47, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }

        // Enclosing Ramparts
        if (
            terrain.get(currentExit.x - 1, 46) !== TERRAIN_MASK_WALL ||
            terrain.get(currentExit.x, 46) !== TERRAIN_MASK_WALL ||
            terrain.get(currentExit.x + 1, 46) !== TERRAIN_MASK_WALL
        ) {
            setRampartIfNotWall(rampartInfo, terrain, new RoomPosition(currentExit.x, 47, currentExit.roomName), exitPosPerSection, currentExit);
        } else if (rampartInfo.ramparts.length) {
            exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
            rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
            rampartInfo.ramparts = [];
        }

        // Closing Ramparts
        if (!nextExit || !currentExit.isNearTo(nextExit)) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x + 1, 47, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x + 2, 47, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x + 2, 48, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }
    }

    for (let i = 0; i < topExits.length; i++) {
        const prevExit = i === 0 ? undefined : topExits[i - 1];
        const currentExit = topExits[i];
        const nextExit = i === topExits.length - 1 ? undefined : topExits[i + 1];

        // Opening Ramparts
        if (!rampartInfo.ramparts.length && (!prevExit || !currentExit.isNearTo(prevExit))) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x - 2, 1, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x - 2, 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x - 1, 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }

        // Enclosing Ramparts
        if (
            terrain.get(currentExit.x - 1, 3) !== TERRAIN_MASK_WALL ||
            terrain.get(currentExit.x, 3) !== TERRAIN_MASK_WALL ||
            terrain.get(currentExit.x + 1, 3) !== TERRAIN_MASK_WALL
        ) {
            setRampartIfNotWall(rampartInfo, terrain, new RoomPosition(currentExit.x, 2, currentExit.roomName), exitPosPerSection, currentExit);
        } else if (rampartInfo.ramparts.length) {
            exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
            rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
            rampartInfo.ramparts = [];
        }

        // Closing Ramparts
        if (!nextExit || !currentExit.isNearTo(nextExit)) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x + 1, 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x + 2, 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(currentExit.x + 2, 1, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }
    }

    for (let i = 0; i < rightExits.length; i++) {
        const prevExit = i === 0 ? undefined : rightExits[i - 1];
        const currentExit = rightExits[i];
        const nextExit = i === rightExits.length - 1 ? undefined : rightExits[i + 1];

        // Opening Ramparts
        if (!rampartInfo.ramparts.length && (!prevExit || !currentExit.isNearTo(prevExit))) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(48, currentExit.y - 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(47, currentExit.y - 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(47, currentExit.y - 1, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }

        // Enclosing Ramparts
        if (
            terrain.get(46, currentExit.y - 1) !== TERRAIN_MASK_WALL ||
            terrain.get(46, currentExit.y) !== TERRAIN_MASK_WALL ||
            terrain.get(46, currentExit.y + 1) !== TERRAIN_MASK_WALL
        ) {
            setRampartIfNotWall(rampartInfo, terrain, new RoomPosition(47, currentExit.y, currentExit.roomName), exitPosPerSection, currentExit);
        } else if (rampartInfo.ramparts.length) {
            exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
            rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
            rampartInfo.ramparts = [];
        }

        // Closing Ramparts
        if (!nextExit || !currentExit.isNearTo(nextExit)) {
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(47, currentExit.y + 1, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(47, currentExit.y + 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
            storeEachRampartAsSeparateSection(
                rampartInfo,
                terrain,
                new RoomPosition(48, currentExit.y + 2, currentExit.roomName),
                exitPosPerSection,
                currentExit
            );
        }
    }

    // Filter out unneeded sections
    const unnededSections = [];
    rampartInfo.rampartsPerSection = rampartInfo.rampartsPerSection.filter((_section, index) => {
        const path = PathFinder.search(exitPosPerSection[index], stamps.storage[0].pos.toRoomPos(), {
            maxRooms: 1,
            roomCallback: function (_roomName) {
                const matrix = new PathFinder.CostMatrix();
                rampartInfo.rampartsPerSection.forEach((section, i) => {
                    if (index !== i && !unnededSections.some((unnededSection) => unnededSection === i)) {
                        section.forEach((position: RoomPosition) => matrix.set(position.x, position.y, 255));
                    }
                });
                return matrix;
            },
        });
        if (path.incomplete) {
            unnededSections.push(index);
        }
        return !path.incomplete;
    });

    // Merge adjacent sections into one section
    if (rampartInfo.rampartsPerSection.length > 1) {
        const mergedArray = [];
        let sectionArray = [];

        for (let i = 0; i < rampartInfo.rampartsPerSection.length; i++) {
            const section = rampartInfo.rampartsPerSection[i];
            if (!sectionArray.length || sectionArray[sectionArray.length - 1].isNearTo(section[0])) {
                sectionArray = sectionArray.concat(section);
            } else {
                mergedArray.push(sectionArray);
                sectionArray = section;
            }
        }
        if (sectionArray[sectionArray.length - 1].isNearTo(mergedArray[0][0])) {
            // For last section also check if its part of the starter section
            mergedArray[0] = mergedArray[0].concat(sectionArray);
        } else {
            // If not simply push it as a new section
            mergedArray.push(sectionArray);
        }
        return mergedArray;
    }
    return rampartInfo.rampartsPerSection;
}

function setRampartIfNotWall(
    rampartInfo: { ramparts: RoomPosition[]; rampartsPerSection: RoomPosition[][] },
    terrain: RoomTerrain,
    pos: RoomPosition,
    exitPosPerSection: { [sectionIndex: number]: RoomPosition },
    currentExit: RoomPosition
) {
    if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
        rampartInfo.ramparts.push(pos);
    } else if (rampartInfo.ramparts.length) {
        exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
        rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
        rampartInfo.ramparts = [];
    }
}

function storeEachRampartAsSeparateSection(
    rampartInfo: { ramparts: RoomPosition[]; rampartsPerSection: RoomPosition[][] },
    terrain: RoomTerrain,
    pos: RoomPosition,
    exitPosPerSection: { [sectionIndex: number]: RoomPosition },
    currentExit: RoomPosition
) {
    if (rampartInfo.ramparts.length) {
        exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
        rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
        rampartInfo.ramparts = [];
    }
    if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
        exitPosPerSection[rampartInfo.rampartsPerSection.length] = currentExit;
        rampartInfo.ramparts.push(pos);
        rampartInfo.rampartsPerSection.push(rampartInfo.ramparts);
        rampartInfo.ramparts = [];
    }
}

/**
 * Fill the targetPositions and roadPositions for the center stamp
 * @param starCenter
 * @param targetPositions
 * @param roadPositions
 */
function setCenterPositions(starCenter: RoomPosition, targetPositions: RoomPosition[], roadPositions: RoomPosition[]) {
    const radius = 3;
    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
            // Exclude corners
            if (
                !(dx === -radius && dy === -radius) &&
                !(dx === radius && dy === -radius) &&
                !(dx === -radius && dy === radius) &&
                !(dx === radius && dy === radius)
            ) {
                // Roads around center
                if (dx === -radius || dx === radius || dy === -radius || dy === radius) {
                    roadPositions.push(new RoomPosition(starCenter.x + dx, starCenter.y + dy, starCenter.roomName));
                } else {
                    targetPositions.push(new RoomPosition(starCenter.x + dx, starCenter.y + dy, starCenter.roomName));
                }
            }
        }
    }
}

function hasWalls(terrain: RoomTerrain, positions: RoomPosition[]) {
    return positions.some((pos) => terrain.get(pos.x, pos.y) === TERRAIN_MASK_WALL);
}

function containsStamp(stamps: Stamps, targetPositions: RoomPosition[]): boolean {
    return []
        .concat(...Object.values(stamps))
        .some((stampDetails: StampDetail) => targetPositions.some((targetPos) => stampDetails.pos === targetPos.toMemSafe()));
}

function containsNonRoadStamp(stamps: Stamps, targetPositions: RoomPosition[]): boolean {
    return (
        stamps.road.some(
            (roadDetail) => roadDetail.type?.includes('source') && targetPositions.some((targetPos) => roadDetail.pos === targetPos.toMemSafe())
        ) ||
        Object.entries(stamps)
            .filter(([key, currentStamps]) => key !== STRUCTURE_ROAD)
            .some(([key, currentStamps]: [string, StampDetail[]]) =>
                currentStamps.some((stampDetail: StampDetail) => targetPositions.some((targetPos) => stampDetail.pos === targetPos.toMemSafe()))
            )
    );
}

export function drawLayout(roomVisual: RoomVisual, stamps: Stamps) {
    Object.entries(stamps)
        .filter(([type, stampDetails]: [string, StampDetail[]]) => type !== STRUCTURE_ROAD)
        .forEach(([type, stampDetails]: [string, StampDetail[]]) => {
            stampDetails.forEach((stampDetail) => {
                let color = '#123456';
                switch (type) {
                    case STRUCTURE_EXTENSION:
                        color = '#FFFF00'; // Yellow
                        break;
                    case STRUCTURE_CONTAINER:
                        color = '#FF0000'; // Red
                        break;
                    case STRUCTURE_STORAGE:
                        color = '#00008B'; // Blue
                        break;
                    case STRUCTURE_LAB:
                        color = '#520031'; // Purple
                        break;
                    case STRUCTURE_TOWER:
                        color = '#800080'; // Purple
                        break;
                    case STRUCTURE_LINK:
                        color = '#000000'; // Black
                        break;
                    case STRUCTURE_POWER_SPAWN:
                        color = '#00008B'; // Blue
                        break;
                    case STRUCTURE_NUKER:
                        color = '#00008B'; // Blue
                        break;
                    case STRUCTURE_OBSERVER:
                        color = '#006400'; // Green
                        break;
                    case STRUCTURE_RAMPART:
                        color = '#0a035c'; // Dark Blue
                        break;
                    case STRUCTURE_SPAWN:
                        color = '#ff006a'; // Pink
                        break;
                    case 'managers':
                        color = '#ff7300'; // Orange
                        break;
                    case STRUCTURE_TERMINAL:
                        color = '#00008B'; // Blue
                        break;
                    case STRUCTURE_FACTORY:
                        color = '#00008B'; // Blue
                        break;
                }

                const stampPosition = stampDetail.pos.toRoomPos();
                roomVisual.circle(stampPosition.x, stampPosition.y, { radius: 0.4, fill: color, stroke: '#ffffff' });
            });
        });

    // Roads
    stamps.road.forEach((roadDetail, i) => {
        if (i < stamps.road.length) {
            stamps.road.slice(i + 1).forEach((nextRoadDetail) => {
                if (roadDetail.pos.toRoomPos().isNearTo(nextRoadDetail.pos.toRoomPos())) {
                    roomVisual.line(roadDetail.pos.toRoomPos(), nextRoadDetail.pos.toRoomPos(), { width: 0.3, opacity: 0.1, lineStyle: 'solid' });
                }
            });
        }
    });
}

// ensures all positions are inside the room with 6 tiles away from the exit. This still allows for roads + ramparts in front of the exit and a buffer zone between structures so they cannot get hit
function positionsInStampBoundary(positions: RoomPosition[]): boolean {
    return !positions.some((pos) => pos.x < 5 || pos.y < 5 || pos.x > 44 || pos.y > 44);
}

// check if position is in an non-buildable area
function isCloseToEdge(pos: RoomPosition): boolean {
    return pos.x < 2 || pos.y < 2 || pos.x > 47 || pos.y > 47;
}

function placeControllerLink(startPos: RoomPosition, stamps: Stamps, terrain: RoomTerrain): void {
    const gridSize = 9;
    // Define layer width and starting layer index
    let layer_width = Math.floor(gridSize / 2);

    const availableSpots = [];
    // Loop through the layers
    while (layer_width >= 0) {
        // Define the boundaries of the current layer
        const x_min = startPos.x - layer_width < 2 ? 2 : startPos.x - layer_width;
        const y_min = startPos.y - layer_width < 2 ? 2 : startPos.y - layer_width;
        const x_max = startPos.x + layer_width > 47 ? 47 : startPos.x + layer_width;
        const y_max = startPos.y + layer_width > 47 ? 47 : startPos.y + layer_width;

        // Loop through the cells in the current layer
        for (let x = x_min; x <= x_max; x++) {
            for (let y = y_min; y <= y_max; y++) {
                // Do something with the current cell, e.g. set it to 1
                const position = new RoomPosition(x, y, startPos.roomName);
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL && !containsStamp(stamps, [position])) {
                    // If its a position already next to a road take it
                    if (stamps.road.some((roadDetail) => position.isNearTo(roadDetail.pos.toRoomPos()))) {
                        stamps.link.push({ type: 'controller', rcl: 8, pos: position.toMemSafe() });
                        return;
                    }
                    availableSpots.push(position);
                }
            }
        }

        // Move to the next layer
        layer_width--;
    }

    const closest = stamps.storage[0].pos.toRoomPos().findClosestByPath(availableSpots); // Costly but since it only runs once its worth it
    stamps.link.push({ type: 'controller', rcl: 8, pos: closest });
}

/**
 * Run a breadth first search to find closest placements for labs/rm/extension stamps.
 * Setting the "visisted.size < 150" higher will use more cpu to find more places to put the "+" extensions stamp. The lower it is the more likely the extensions
 * are going to be simply around nearby roads.
 * @param startPos
 * @param stamps
 * @param terrain
 * @returns
 */
function bfs(startPos: RoomPosition, stamps: Stamps, terrain: RoomTerrain): boolean {
    let visited: Set<string> = new Set();
    let queue: RoomPosition[] = [startPos];

    // subtract miner length from extensions because for each miner a road will later on which decreases the amount of extensions around the miner
    while ((queue.length > 0 && !stamps.storage.length) || !stamps.lab.length) {
        if (Game.cpu.tickLimit - Game.cpu.getUsed() < 30) {
            console.log('Ran out of cpu so stopped execution.');
            return false;
        }
        const pos: RoomPosition = queue.shift()!;
        // Mark the position as visited
        visited.add(pos.toMemSafe());

        // Add the unvisited neighbors to the queue
        pos.neighbors(false)
            .filter(
                (neighborPos) =>
                    positionsInStampBoundary([neighborPos]) &&
                    !visited.has(neighborPos.toMemSafe()) &&
                    terrain.get(neighborPos.x, neighborPos.y) !== TERRAIN_MASK_WALL
            )
            .forEach((neighborPos) => {
                // Add the neighbor to the queue
                queue.push(neighborPos);
            });
        // skip if it already has a structure on it
        if (containsStamp(stamps, [pos])) {
            continue;
        }

        // Resource Management
        if (!stamps.storage.length) {
            const targetPositions = [];
            const roadPositions = [];
            for (let dx = -1; dx <= 2; dx++) {
                for (let dy = -1; dy <= 3; dy++) {
                    // Exclude corners
                    if (!(dx === -1 && dy === -1) && !(dx === -1 && dy === 3) && !(dx === 2 && dy === -1) && !(dx === 2 && dy === 3)) {
                        // Roads around center
                        if (dx === -1 || dx === 2 || dy === -1 || dy === 3) {
                            roadPositions.push(new RoomPosition(pos.x + dx, pos.y + dy, pos.roomName));
                        } else {
                            targetPositions.push(new RoomPosition(pos.x + dx, pos.y + dy, pos.roomName));
                        }
                    }
                }
            }
            // Avoid being in base + allow corners + avid other extension stamps
            if (
                !hasWalls(terrain, targetPositions.concat(roadPositions)) &&
                positionsInStampBoundary(targetPositions) &&
                !containsStamp(stamps, targetPositions) &&
                !containsNonRoadStamp(stamps, roadPositions)
            ) {
                logCpu('RM Found');
                const rm = 'rm';
                stamps.storage.push({ type: rm, rcl: 4, pos: new RoomPosition(pos.x, pos.y, pos.roomName).toMemSafe() });
                stamps.rampart.push({ type: rm, rcl: 4, pos: new RoomPosition(pos.x, pos.y, pos.roomName).toMemSafe() });
                stamps.nuker.push({ type: rm, rcl: 8, pos: new RoomPosition(pos.x + 1, pos.y, pos.roomName).toMemSafe() });
                stamps.terminal.push({ type: rm, rcl: 6, pos: new RoomPosition(pos.x, pos.y + 1, pos.roomName).toMemSafe() });
                stamps.rampart.push({ type: rm, rcl: 6, pos: new RoomPosition(pos.x, pos.y + 1, pos.roomName).toMemSafe() });
                stamps.managers.push({ type: rm, rcl: 5, pos: new RoomPosition(pos.x + 1, pos.y + 1, pos.roomName).toMemSafe() });
                stamps.link.push({ type: rm, rcl: 5, pos: new RoomPosition(pos.x, pos.y + 2, pos.roomName).toMemSafe() });
                stamps.factory.push({ type: rm, rcl: 7, pos: new RoomPosition(pos.x + 1, pos.y + 2, pos.roomName).toMemSafe() });
                roadPositions.forEach((roadPos: RoomPosition) => addUniqueRoad(stamps, { rcl: 4, pos: roadPos.toMemSafe() }));
                addMissingRoads(startPos, roadPositions[0], stamps, 4);
                continue;
            }
        }

        // Labs
        if (!stamps.lab.length) {
            let targetPositions = [];
            let roadPositions = [];

            // only checks from left to right (bottom to top) direction. Can be improved by also checking a right to left (bottom to top) direction if need be
            targetPositions = [
                new RoomPosition(pos.x - 1, pos.y, pos.roomName),
                new RoomPosition(pos.x - 2, pos.y, pos.roomName),
                new RoomPosition(pos.x - 2, pos.y + 1, pos.roomName),
                new RoomPosition(pos.x - 3, pos.y + 1, pos.roomName),
                new RoomPosition(pos.x - 3, pos.y + 2, pos.roomName),
                new RoomPosition(pos.x, pos.y + 1, pos.roomName),
                new RoomPosition(pos.x, pos.y + 2, pos.roomName),
                new RoomPosition(pos.x - 1, pos.y + 2, pos.roomName),
                new RoomPosition(pos.x - 1, pos.y + 3, pos.roomName),
                new RoomPosition(pos.x - 2, pos.y + 3, pos.roomName),
            ];
            roadPositions = [
                new RoomPosition(pos.x, pos.y, pos.roomName),
                new RoomPosition(pos.x - 1, pos.y + 1, pos.roomName),
                new RoomPosition(pos.x - 2, pos.y + 2, pos.roomName),
                new RoomPosition(pos.x - 3, pos.y + 3, pos.roomName), // Optional but good to leave an out on both sides of the labs
            ];

            // Avoid being in base + allow corners + avid other extension stamps
            if (
                !hasWalls(terrain, targetPositions.concat(roadPositions)) &&
                positionsInStampBoundary(targetPositions) &&
                !containsStamp(stamps, targetPositions) &&
                !containsNonRoadStamp(stamps, roadPositions) &&
                !stamps.container
                    .filter((containerDetail) => containerDetail.type?.includes('source'))
                    .some((minerContainer) => targetPositions.some((t) => t.getRangeTo(minerContainer.pos) < 3))
            ) {
                logCpu('Lab Found');
                targetPositions.forEach((labPos) => {
                    let rcl = 6;
                    if (stamps.lab.length >= 6) {
                        rcl = 8;
                    } else if (stamps.lab.length >= 3) {
                        rcl = 7;
                    }
                    stamps.lab.push({ rcl, pos: labPos.toMemSafe() });
                });
                roadPositions.forEach((roadPos: RoomPosition) => addUniqueRoad(stamps, { type: STRUCTURE_LAB, rcl: 6, pos: roadPos.toMemSafe() }));
                addMissingRoads(startPos, roadPositions[0], stamps, 6);
                continue;
            }
        }
    }

    visited = new Set();
    queue = [startPos];
    while (queue.length > 0 && stamps.extension.length < 56 && Game.cpu.tickLimit - Game.cpu.getUsed() > (Memory.cpuUsage.average ?? 150) + 100) {
        const pos: RoomPosition = queue.shift()!;
        // Mark the position as visited
        visited.add(pos.toMemSafe());

        // Add the unvisited neighbors to the queue
        pos.neighbors(false)
            .filter(
                (neighborPos) =>
                    positionsInStampBoundary([neighborPos]) &&
                    !visited.has(neighborPos.toMemSafe()) &&
                    terrain.get(neighborPos.x, neighborPos.y) !== TERRAIN_MASK_WALL
            )
            .forEach((neighborPos) => {
                // Add the neighbor to the queue
                queue.push(neighborPos);
            });
        // skip if it already has a structure on it
        if (containsStamp(stamps, [pos])) {
            continue;
        }

        // Extensions since the square is 2 wide, the center must be at least 2 tiles away from edges (cant build on x/y = 0/49 or in front of exits)
        // These go last since they can always be put around roads
        const targetPositions = [
            pos,
            new RoomPosition(pos.x - 1, pos.y, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y, pos.roomName),
            new RoomPosition(pos.x, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x, pos.y + 1, pos.roomName),
        ];
        const roadPositions = [
            new RoomPosition(pos.x - 1, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y - 1, pos.roomName),
            new RoomPosition(pos.x + 1, pos.y + 1, pos.roomName),
            new RoomPosition(pos.x - 1, pos.y + 1, pos.roomName),
            new RoomPosition(pos.x - 2, pos.y, pos.roomName),
            new RoomPosition(pos.x, pos.y + 2, pos.roomName),
            new RoomPosition(pos.x + 2, pos.y, pos.roomName),
            new RoomPosition(pos.x, pos.y - 2, pos.roomName),
        ];
        // Avoid being in base + allow corners + avid other stamps
        if (
            !hasWalls(terrain, targetPositions.concat(roadPositions)) &&
            positionsInStampBoundary(targetPositions) &&
            !containsStamp(stamps, targetPositions) &&
            !containsNonRoadStamp(stamps, roadPositions)
        ) {
            const rcl = 3 + Math.floor(stamps.extension.length / 10);
            targetPositions.forEach((extensionPos) => {
                let extensionRcl = 3 + Math.floor(stamps.extension.length / 10);
                // Stamps will at the earliest be placed at rcl4 and each new level increases the number of extensions by 10. To calculate the rcl simply take the current extensionCount and divide it by 10 to find the correleating controller level
                stamps.extension.push({ rcl: extensionRcl, pos: extensionPos.toMemSafe() });
            });
            roadPositions.forEach((roadPos) => addUniqueRoad(stamps, { rcl, pos: roadPos.toMemSafe() })); // before adding extensions to have proper rcl
            addMissingRoads(startPos, roadPositions[0], stamps, rcl);
            continue;
        }
    }
    return true;
}

/**
 * Find the mining position with the most open areas around to maximize number of extensions
 * @param room
 * @returns
 */
function findBestMiningPostitions(room: Room, terrain: RoomTerrain): { pos: RoomPosition; adjacentSpaces: RoomPosition[] }[] {
    // TODO: two sources next to each other see W57S21
    const sources = room.find(FIND_SOURCES);
    const miningPositions = sources.map((source) => {
        let bestSpot: { pos: RoomPosition; adjacentSpaces: RoomPosition[] };
        source.pos
            .neighbors()
            .filter((pos) => terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL && !isCloseToEdge(pos))
            .forEach((pos) => {
                // all possible positions ==> now find the one with the most free spots around it
                const adjacentSpaces = pos
                    .neighbors()
                    .filter((minerPos) => terrain.get(minerPos.x, minerPos.y) !== TERRAIN_MASK_WALL && !isCloseToEdge(minerPos));

                // New best spot
                if (!bestSpot || bestSpot.adjacentSpaces?.length < adjacentSpaces.length) {
                    bestSpot = { pos, adjacentSpaces };
                }
            });
        return bestSpot;
    });

    // if a unique mining position was found for each source
    if (miningPositions.length === sources.length) {
        return miningPositions;
    }

    return undefined;
}

/**
 * Places single structures such as towers, left over extensions, observers, etc. around already placed roads. It will prioritize roads around center/extensions/rm first
 */
function addSingleStructures(stamps: Stamps, terrain: RoomTerrain, exitAvg: RoomPosition) {
    logCpu('Start addSingleStructures');
    const storagePos = stamps.storage[0].pos;
    // Sort roads ==> roads without type first as these are around stamps which the distributor has to go to anyway. Then sort the rest of the roads by range to storage so it will put stuff close to it
    let roads = stamps.road
        .filter((roadDetail) => roadDetail.type !== 'notBuildable' && positionsInStampBoundary([roadDetail.pos.toRoomPos()]))
        .sort((a, b) => {
            if (a.type && !b.type) {
                return 1;
            } else if (!a.type && b.type) {
                return -1;
            } else if (a.type?.includes('source') && !b.type?.includes('source')) {
                return -1;
            } else if (b.type?.includes('source') && !a.type?.includes('source')) {
                return 1;
            }
            const rangeA = storagePos.toRoomPos().getRangeTo(a.pos.toRoomPos());
            const rangeB = storagePos.toRoomPos().getRangeTo(b.pos.toRoomPos());
            if (rangeA > rangeB) {
                return 1;
            } else if (rangeB > rangeA) {
                return -1;
            }
            return 0;
        })
        .map((roadDetail) => roadDetail.pos);

    while (roads.length > 0 && (stamps.extension.length < 60 || !stamps.powerSpawn.length || !stamps.observer.length)) {
        let neighbors = roads
            .shift()
            .toRoomPos()
            .neighbors(true, false)
            .filter(
                (neighbor) =>
                    !containsStamp(stamps, [neighbor]) &&
                    positionsInStampBoundary([neighbor]) &&
                    terrain.get(neighbor.x, neighbor.y) !== TERRAIN_MASK_WALL
            );
        while (neighbors.length && (stamps.extension.length < 60 || !stamps.powerSpawn.length || !stamps.observer.length)) {
            // Extensions
            if (stamps.extension.length < 60 && neighbors.length) {
                stamps.extension.push({ rcl: 3 + Math.floor(stamps.extension.length / 10), pos: neighbors.pop().toMemSafe() });
            }

            // PowerSpawner
            if (!stamps.powerSpawn.length && neighbors.length) {
                stamps.powerSpawn.push({ rcl: 8, pos: neighbors.pop().toMemSafe() });
            }

            // Observer - last since it doesnt need to be close to anything
            if (neighbors.length && stamps.extension.length > 59 && stamps.powerSpawn.length && !stamps.observer.length) {
                stamps.observer.push({ rcl: 8, pos: neighbors.pop().toMemSafe() });
            }
        }
    }

    roads = roads.sort((a, b) => {
        const rangeA = exitAvg.getRangeTo(a.toRoomPos());
        const rangeB = exitAvg.getRangeTo(b.toRoomPos());
        if (rangeA > rangeB) {
            return 1;
        } else if (rangeB > rangeA) {
            return -1;
        }
        return 0;
    });

    // Put towers around the avg to all ramparts
    while (roads.length > 0 && stamps.tower.length < 6) {
        let neighbors = roads
            .shift()
            .toRoomPos()
            .neighbors(true, false)
            .filter(
                (neighbor) =>
                    positionsInStampBoundary([neighbor]) &&
                    terrain.get(neighbor.x, neighbor.y) !== TERRAIN_MASK_WALL &&
                    !containsStamp(stamps, [neighbor])
            );

        while (neighbors.length && stamps.tower.length < 6) {
            // Towers
            const towerCount = stamps.tower.length;
            let rcl = 3;
            if (towerCount === 1) {
                rcl = 5;
            } else if (towerCount === 2) {
                rcl = 7;
            } else if (towerCount > 2) {
                rcl = 8;
            }
            stamps.tower.push({ rcl: rcl, pos: neighbors.pop().toMemSafe() });
        }
    }

    logCpu('End addSingleStructures');
}

function addRoadToPois(poi: RoomPosition, stamps: Stamps, rcl: number, type: string, terrain: RoomTerrain, range: number = 1) {
    const path = findPathToPoi(poi, stamps, type, terrain, range);

    if (type === 'mineral') {
        const lastStep = path.pop();
        const pos = new RoomPosition(lastStep.x, lastStep.y, stamps.storage[0].pos.toRoomPos().roomName);
        if (!isCloseToEdge(pos) && !containsStamp(stamps, [pos])) {
            stamps.container.push({
                type,
                rcl: 6,
                pos: new RoomPosition(lastStep.x, lastStep.y, stamps.storage[0].pos.toRoomPos().roomName).toMemSafe(),
            });
        } else {
            const freePos = pos
                .neighbors(true, false)
                .find((neighborPos) => !hasWalls(terrain, [neighborPos]) && !containsStamp(stamps, [neighborPos]) && neighborPos.isNearTo(poi));
            stamps.container.push({
                type,
                rcl: 6,
                pos: freePos.toMemSafe(),
            });
        }
    } else if (type?.includes('source') && path.length > 0) {
        const lastStep = path[path.length - 1];
        // Replace extension/link with a road (is already taken into account in previous methods so 60 extensions will still be placed)
        const road = stamps.road.find((roadStamp) => roadStamp.type === type);
        if (road.pos.toRoomPos().x !== lastStep.x || road.pos.toRoomPos().y !== lastStep.y) {
            const extension = stamps.extension.find(
                (extensionStamp) =>
                    extensionStamp.type === type && extensionStamp.pos.toRoomPos().x === lastStep.x && extensionStamp.pos.toRoomPos().y === lastStep.y
            );
            if (extension) {
                // Swap Extension with Road Position
                extension.pos = road.pos;
            } else {
                // Swap Link with Road Position
                const link = stamps.link.find(
                    (linkStamp) => linkStamp.type === type && linkStamp.pos.toRoomPos().x === lastStep.x && linkStamp.pos.toRoomPos().y === lastStep.y
                );
                if (link) {
                    link.pos = road.pos;
                }
            }
            road.pos = new RoomPosition(lastStep.x, lastStep.y, stamps.storage[0].pos.toRoomPos().roomName).toMemSafe();
        }
    } else if (type === STRUCTURE_CONTROLLER && path.length > 1) {
        const lastStep = path[path.length - 1];
        const avoidStep = path[path.length - 2];
        const pos = new RoomPosition(lastStep.x, lastStep.y, stamps.storage[0].pos.toRoomPos().roomName);
        const freePos = pos
            .neighbors(false, true)
            .find(
                (neighborPos) =>
                    (pos.x !== neighborPos.x || pos.y !== neighborPos.y) &&
                    (avoidStep.x !== neighborPos.x || avoidStep.y !== neighborPos.y) &&
                    !hasWalls(terrain, [neighborPos]) &&
                    !containsStamp(stamps, [neighborPos])
            );
        if (freePos) {
            stamps.link.push({ type: 'controller', rcl: 8, pos: freePos.toMemSafe() });
        } else {
            placeControllerLink(poi, stamps, terrain);
            findPathToPoi(poi, stamps, type, terrain, range);
        }
    }

    //add unique road positions for next cost_matrix
    path.forEach((step, index) => {
        const road = stamps.road.find((roadDetail) => roadDetail.pos.toRoomPos().x === step.x && roadDetail.pos.toRoomPos().y === step.y);
        if (!road) {
            if (type === STRUCTURE_CONTROLLER && index === path.length - 1) {
                addUniqueRoad(stamps, {
                    type: 'notBuildable',
                    rcl,
                    pos: new RoomPosition(step.x, step.y, stamps.storage[0].pos.toRoomPos().roomName).toMemSafe(),
                });
            } else {
                addUniqueRoad(stamps, { type, rcl, pos: new RoomPosition(step.x, step.y, stamps.storage[0].pos.toRoomPos().roomName).toMemSafe() });
            }
        } else if (road.rcl > rcl) {
            // Override rcl
            road.rcl = rcl;
        }
    });
}

function findPathToPoi(poi: RoomPosition, stamps: Stamps, type: string, terrain: RoomTerrain, range: number = 1) {
    return stamps.storage[0].pos.toRoomPos().findPathTo(poi, {
        plainCost: 3,
        swampCost: 5,
        ignoreDestructibleStructures: true,
        ignoreCreeps: true,
        ignoreRoads: true,
        range: range,
        costCallback: function (roomName, costMatrix) {
            const matrix = costMatrix.clone();
            stamps.road.forEach((roadStamp) => matrix.set(roadStamp.pos.toRoomPos().x, roadStamp.pos.toRoomPos().y, 1));
            Object.entries(stamps)
                .filter(([key, currentStamps]: [string, StampDetail[]]) => key !== STRUCTURE_ROAD && key !== STRUCTURE_RAMPART)
                .forEach(([key, currentStamps]: [string, StampDetail[]]) =>
                    currentStamps
                        .filter((nonRoadStamp) => nonRoadStamp.type !== type)
                        .forEach((nonRoadStamp) => matrix.set(nonRoadStamp.pos.toRoomPos().x, nonRoadStamp.pos.toRoomPos().y, 50))
                );
            for (let i = 0; i < 50; i++) {
                Pathing.setMatrixIfNotWall(terrain, matrix, 0, i, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, 1, i, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, 48, i, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, 49, i, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, i, 0, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, i, 1, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, i, 48, 20);
                Pathing.setMatrixIfNotWall(terrain, matrix, i, 49, 20);
            }
            return matrix;
        },
    });
}

/**
 * Costly but needed to ensure all stamps are connected via road
 * @param starCenter
 * @param sourcePos
 * @param stamps
 * @param rcl
 */
function addMissingRoads(starCenter: RoomPosition, sourcePos: RoomPosition, stamps: Stamps, rcl: number) {
    const path = sourcePos.findPathTo(starCenter, {
        plainCost: 3,
        swampCost: 5,
        ignoreDestructibleStructures: true,
        ignoreCreeps: true,
        range: 3,
        maxRooms: 1,
        costCallback: function (roomName, costMatrix) {
            const matrix = costMatrix.clone();
            stamps.road.forEach((roadDetail) => matrix.set(roadDetail.pos.toRoomPos().x, roadDetail.pos.toRoomPos().y, 1));
            Object.entries(stamps)
                .filter(([key, currentStamps]) => key !== STRUCTURE_ROAD && key !== STRUCTURE_RAMPART)
                .forEach(([key, currentStamps]: [string, StampDetail[]]) =>
                    currentStamps.forEach((stampDetail) => matrix.set(stampDetail.pos.toRoomPos().x, stampDetail.pos.toRoomPos().y, 50))
                );
            return matrix;
        },
    });

    //add unique road positions for next cost_matrix
    path.filter(
        (step) => !stamps.road.some((roadDetail) => roadDetail.pos.toRoomPos().x === step.x && roadDetail.pos.toRoomPos().y === step.y)
    ).forEach((uniqueStep) => addUniqueRoad(stamps, { rcl, pos: new RoomPosition(uniqueStep.x, uniqueStep.y, starCenter.roomName).toMemSafe() }));
}

function setCenterExtensions(stamps: Stamps, starCenter: RoomPosition) {
    const type = 'center';
    // RCL 1
    stamps.spawn.push({ type, rcl: 1, pos: new RoomPosition(starCenter.x - 2, starCenter.y - 1, starCenter.roomName).toMemSafe() });

    // RCL 2
    stamps.extension.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x - 2, starCenter.y - 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x - 1, starCenter.y - 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x, starCenter.y - 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x, starCenter.y - 1, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x - 1, starCenter.y, starCenter.roomName).toMemSafe() });
    stamps.managers.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x - 1, starCenter.y - 1, starCenter.roomName).toMemSafe() });
    stamps.container.push({ type, rcl: 2, pos: new RoomPosition(starCenter.x - 2, starCenter.y, starCenter.roomName).toMemSafe() });

    // RCL 3
    stamps.extension.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x + 1, starCenter.y + 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x + 2, starCenter.y + 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x + 2, starCenter.y + 1, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x + 1, starCenter.y, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x, starCenter.y + 1, starCenter.roomName).toMemSafe() });
    stamps.container.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x + 2, starCenter.y, starCenter.roomName).toMemSafe() });
    stamps.managers.push({ type, rcl: 3, pos: new RoomPosition(starCenter.x + 1, starCenter.y + 1, starCenter.roomName).toMemSafe() });

    // RCL 4
    stamps.extension.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x - 2, starCenter.y + 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x - 1, starCenter.y + 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x - 2, starCenter.y + 1, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x + 1, starCenter.y - 2, starCenter.roomName).toMemSafe() });
    stamps.extension.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x + 2, starCenter.y - 2, starCenter.roomName).toMemSafe() });
    stamps.managers.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x - 1, starCenter.y + 1, starCenter.roomName).toMemSafe() });
    stamps.managers.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x + 1, starCenter.y - 1, starCenter.roomName).toMemSafe() });
    stamps.rampart.push({ type, rcl: 4, pos: new RoomPosition(starCenter.x - 2, starCenter.y - 1, starCenter.roomName).toMemSafe() });

    // RCL 5
    stamps.link.push({ type, rcl: 5, pos: new RoomPosition(starCenter.x, starCenter.y, starCenter.roomName).toMemSafe() });

    // RCL 7
    stamps.spawn.push({ type, rcl: 7, pos: new RoomPosition(starCenter.x + 2, starCenter.y - 1, starCenter.roomName).toMemSafe() });
    stamps.rampart.push({ type, rcl: 7, pos: new RoomPosition(starCenter.x + 2, starCenter.y - 1, starCenter.roomName).toMemSafe() });

    // RCL 8
    stamps.spawn.push({ type, rcl: 8, pos: new RoomPosition(starCenter.x, starCenter.y + 2, starCenter.roomName).toMemSafe() });
    stamps.rampart.push({ type, rcl: 8, pos: new RoomPosition(starCenter.x, starCenter.y + 2, starCenter.roomName).toMemSafe() });
}

function addUniqueRoad(stamps: Stamps, roadDetail: StampDetail) {
    const previousRoadIndex = stamps.road.findIndex((road) => road.pos === roadDetail.pos);
    if (previousRoadIndex === -1) {
        stamps.road.push(roadDetail);
    } else if (roadDetail.rcl < stamps.road[previousRoadIndex].rcl) {
        stamps.road[previousRoadIndex].rcl = roadDetail.rcl; // override rcl
    }
}

function logCpu(message: string) {
    if (debug) {
        console.log(`${message}: ${Game.cpu.getUsed()}`);
    }
}
