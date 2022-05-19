import { posFromMem } from './memoryManagement';

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

export function findBunkerLocation(room: Room): RoomPosition {
    let poiAvg = findPoiAverage(room);
    let anchorPoint = new RoomPosition(poiAvg.x - 1, poiAvg.y + 1, room.name);

    let valid = checkBunkerBoundary(anchorPoint);

    if (!valid) {
        for (let lookDistance = 1; lookDistance < 50; lookDistance++) {
            let lookPos: RoomPosition;
            let x: number, y: number;

            for (y = anchorPoint.y - lookDistance; y <= anchorPoint.y + lookDistance && !valid; y++) {
                for (x = anchorPoint.x - lookDistance; x <= anchorPoint.x + lookDistance && !valid; x++) {
                    if (y > anchorPoint.y - lookDistance && y < anchorPoint.y + lookDistance && x > anchorPoint.x - lookDistance) {
                        x = anchorPoint.x + lookDistance;
                    }

                    // since the square is 13 wide, the center must be at least 7 tiles away from edges (cant build on x/y = 0/49 or in front of exits)
                    if (x > 8 && x < 42 && y > 8 && y < 42) {
                        lookPos = new RoomPosition(x, y, anchorPoint.roomName);

                        valid = checkBunkerBoundary(lookPos);
                    }
                    if (valid) {
                        anchorPoint = lookPos;
                        drawBunker(anchorPoint);
                        drawRoadsToPOIs(room, anchorPoint);
                    }
                }
            }
        }
    }

    return valid ? anchorPoint : undefined;
}

function checkBunkerBoundary(anchorPoint: RoomPosition) {
    let room = Game.rooms[anchorPoint.roomName];

    let areaLooks = room.lookForAtArea(LOOK_TERRAIN, anchorPoint.y - 6, anchorPoint.x - 6, anchorPoint.y + 6, anchorPoint.x + 6, true);

    //if there are any walls in the area
    return !areaLooks.some((look) => look.terrain === 'wall');
}

export function drawBunker(anchorPoint: RoomPosition) {
    let roomVis = Game.rooms[anchorPoint.roomName].visual;

    //draw roads
    roomVis.poly([
        [anchorPoint.x, anchorPoint.y - 3],
        [anchorPoint.x + 3, anchorPoint.y],
        [anchorPoint.x, anchorPoint.y + 3],
        [anchorPoint.x - 3, anchorPoint.y],
        [anchorPoint.x, anchorPoint.y - 3],
    ]);
    roomVis.line(anchorPoint.x, anchorPoint.y - 3, anchorPoint.x, anchorPoint.y - 5);
    roomVis.line(anchorPoint.x, anchorPoint.y - 5, anchorPoint.x - 1, anchorPoint.y - 6);
    roomVis.line(anchorPoint.x, anchorPoint.y - 5, anchorPoint.x + 1, anchorPoint.y - 6);
    roomVis.line(anchorPoint.x, anchorPoint.y + 3, anchorPoint.x, anchorPoint.y + 5);
    roomVis.line(anchorPoint.x, anchorPoint.y + 5, anchorPoint.x - 1, anchorPoint.y + 6);
    roomVis.line(anchorPoint.x, anchorPoint.y + 5, anchorPoint.x + 1, anchorPoint.y + 6);
    roomVis.line(anchorPoint.x + 3, anchorPoint.y, anchorPoint.x + 5, anchorPoint.y);
    roomVis.line(anchorPoint.x + 5, anchorPoint.y, anchorPoint.x + 6, anchorPoint.y - 1);
    roomVis.line(anchorPoint.x + 5, anchorPoint.y, anchorPoint.x + 6, anchorPoint.y + 1);
    roomVis.line(anchorPoint.x - 3, anchorPoint.y, anchorPoint.x - 5, anchorPoint.y);
    roomVis.line(anchorPoint.x - 5, anchorPoint.y, anchorPoint.x - 6, anchorPoint.y - 1);
    roomVis.line(anchorPoint.x - 5, anchorPoint.y, anchorPoint.x - 6, anchorPoint.y + 1);
    roomVis.line(anchorPoint.x - 2 + 0.5, anchorPoint.y - 2 + 0.5, anchorPoint.x - 6, anchorPoint.y - 6);
    roomVis.line(anchorPoint.x + 2 - 0.5, anchorPoint.y - 2 + 0.5, anchorPoint.x + 6, anchorPoint.y - 6);
    roomVis.line(anchorPoint.x + 2 - 0.5, anchorPoint.y + 2 - 0.5, anchorPoint.x + 6, anchorPoint.y + 6);
    roomVis.line(anchorPoint.x - 2 + 0.5, anchorPoint.y + 2 - 0.5, anchorPoint.x - 6, anchorPoint.y + 6);

    roomVis.line(anchorPoint.x - 6, anchorPoint.y + 6, anchorPoint.x + 6, anchorPoint.y + 6);
    roomVis.line(anchorPoint.x + 6, anchorPoint.y - 6, anchorPoint.x - 6, anchorPoint.y - 6);
    roomVis.line(anchorPoint.x - 6, anchorPoint.y - 6, anchorPoint.x - 6, anchorPoint.y + 6);
    roomVis.line(anchorPoint.x + 6, anchorPoint.y - 6, anchorPoint.x + 6, anchorPoint.y + 6);

    //draw border
    roomVis.rect(anchorPoint.x - 6 - 0.5, anchorPoint.y - 6 - 0.5, 13, 13, { fill: '#00E2FF', opacity: 0.1 });
}

export function getStructureForPos(layout: RoomLayout, targetPos: RoomPosition, anchorPoint: RoomPosition): BuildableStructureConstant {
    switch (layout) {
        case RoomLayout.BUNKER:
            let xdif = targetPos.x - anchorPoint.x;
            let ydif = targetPos.y - anchorPoint.y;

            if (targetPos === anchorPoint || Math.abs(xdif) >= 7 || Math.abs(ydif) >= 7) {
                return undefined;
            }

            if (xdif === 0) {
                switch (ydif) {
                    case 1:
                        return STRUCTURE_TERMINAL;
                    case -1:
                        return STRUCTURE_SPAWN;
                    case -2:
                    case 2:
                    case -6:
                    case 6:
                        return STRUCTURE_EXTENSION;
                    default:
                        return STRUCTURE_ROAD;
                }
            }

            if (ydif === 0) {
                switch (xdif) {
                    case -2:
                        return STRUCTURE_OBSERVER;
                    case -1:
                        return STRUCTURE_LINK;
                    case 1:
                        return STRUCTURE_FACTORY;
                    case 2:
                        return STRUCTURE_SPAWN;
                    default:
                        return STRUCTURE_ROAD;
                }
            }

            if (Math.abs(xdif) === 6 || Math.abs(ydif) === 6) {
                return STRUCTURE_ROAD;
            }

            if (ydif === -1 && xdif === -1) {
                return STRUCTURE_SPAWN;
            }
            if (ydif === -1 && xdif === 1) {
                return STRUCTURE_STORAGE;
            }
            if (ydif === 1 && xdif === 1) {
                return STRUCTURE_POWER_SPAWN;
            }
            if (ydif === 1 && xdif === -1) {
                return STRUCTURE_NUKER;
            }

            if (Math.abs(ydif) === Math.abs(xdif) && Math.abs(ydif) <= 5) {
                return STRUCTURE_ROAD;
            }
            if ((ydif === -3 && xdif >= -1 && xdif <= 2) || (xdif === 3 && ydif >= -2 && ydif <= 1)) {
                return STRUCTURE_TOWER;
            }
            if (ydif <= -2 && ydif >= -5 && xdif <= -3 && xdif >= -4) {
                return STRUCTURE_LAB;
            }
            if (ydif <= -3 && ydif >= -4 && (xdif === -2 || xdif === -5)) {
                return STRUCTURE_LAB;
            }

            if ((Math.abs(ydif) === 2 && Math.abs(xdif) === 1) || (Math.abs(xdif) === 2 && Math.abs(ydif) === 1)) {
                return STRUCTURE_ROAD;
            }

            return STRUCTURE_EXTENSION;
    }
}

export function getSpawnPos(room: Room) {
    switch (room.memory.layout) {
        case RoomLayout.BUNKER:
            let anchorPoint = posFromMem(room.memory.anchorPoint);
            return new RoomPosition(anchorPoint.x, anchorPoint.y - 1, room.name);
    }
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

function getBunkerRoadsToPOIs(anchorPos: RoomPosition) {
    let room = Game.rooms[anchorPos.roomName];
    let pois: (Source | StructureController | Mineral)[] = [];

    pois.push(...room.find(FIND_SOURCES));
    pois.push(room.controller);
    pois.push(...room.find(FIND_MINERALS));

    let storagePos = new RoomPosition(anchorPos.x + 1, anchorPos.y - 1, anchorPos.roomName);
    let roadPositions = [];
    let blockedPositions = [];

    //prepopulate roadpositions w/ predetermined layout roads
    let topLeft = new RoomPosition(anchorPos.x - 6, anchorPos.y - 6, room.name);
    for (let xDif = 0; xDif < 13; xDif++) {
        for (let yDif = 0; yDif < 13; yDif++) {
            let lookPos = new RoomPosition(topLeft.x + xDif, topLeft.y + yDif, room.name);
            if (getStructureForPos(RoomLayout.BUNKER, lookPos, anchorPos) === STRUCTURE_ROAD) {
                roadPositions.push(lookPos);
            } else {
                blockedPositions.push(lookPos);
            }
        }
    }

    roadPositions.push(...room.find(FIND_MY_CONSTRUCTION_SITES).filter((site) => site.structureType === STRUCTURE_ROAD));

    let paths = pois.map((poi) => {
        //if destination is a controller, range = 3 instead of 1

        //@ts-ignore
        let path = poi.my
            ? storagePos.findPathTo(poi, {
                  plainCost: 3,
                  swampCost: 5,
                  ignoreDestructibleStructures: true,
                  ignoreCreeps: true,
                  range: 3,
                  costCallback: function (roomName, costMatrix) {
                      let matrix = costMatrix.clone();
                      roadPositions.forEach((roadPos) => matrix.set(roadPos.x, roadPos.y, 1));
                      blockedPositions.forEach((roadPos) => matrix.set(roadPos.x, roadPos.y, 5));
                      return matrix;
                  },
              })
            : storagePos.findPathTo(poi, {
                  plainCost: 3,
                  swampCost: 5,
                  ignoreDestructibleStructures: true,
                  ignoreCreeps: true,
                  range: 1,
                  costCallback: function (roomName, costMatrix) {
                      let matrix = costMatrix.clone();
                      roadPositions.forEach((roadPos) => matrix.set(roadPos.x, roadPos.y, 1));
                      blockedPositions.forEach((roadPos) => matrix.set(roadPos.x, roadPos.y, 5));
                      return matrix;
                  },
              });

        //add unique road positions for next cost_matrix
        roadPositions = roadPositions.concat(path.filter((step) => roadPositions.indexOf(step) === -1));

        //remove last step from path
        path.pop();

        return path;
    });

    return paths;
}

export function drawRoadsToPOIs(room: Room, anchorPos?: RoomPosition) {
    if (!anchorPos) {
        anchorPos = posFromMem(room.memory.anchorPoint);
    }

    let paths = getBunkerRoadsToPOIs(anchorPos);

    paths.forEach((path) => {
        //@ts-ignore
        room.visual.poly(path, { stroke: '#fff', strokeWidth: 0.15, opacity: 0.8, lineStyle: 'dotted' });
    });
}

export function placeRoadsToPOIs(room: Room, anchorPos?: RoomPosition) {
    if (!anchorPos) {
        anchorPos = posFromMem(room.memory.anchorPoint);
    }

    let paths = getBunkerRoadsToPOIs(anchorPos);

    paths.forEach((path) => {
        //@ts-ignore
        path.forEach((step) => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
    });
}

export function posInsideBunker(pos: RoomPosition, anchorPos?: RoomPosition) {
    if (!anchorPos) {
        anchorPos = posFromMem(Game.rooms[pos.roomName].memory.anchorPoint);
    }

    return !!anchorPos ? pos.x <= anchorPos.x + 6 && pos.x >= anchorPos.x - 6 && pos.y <= anchorPos.y + 6 && pos.y >= anchorPos.y - 6 : false;
}

export function placeBunkerOuterRamparts(room: Room) {
    let anchor = posFromMem(room.memory.anchorPoint);

    let topLeft = new RoomPosition(anchor.x - 6, anchor.y - 6, room.name);
    for (let xDif = 0; xDif < 13; xDif++) {
        for (let yDif = 0; yDif < 13; yDif++) {
            if (yDif === 0 || xDif === 0 || yDif === 12 || xDif === 12) {
                room.createConstructionSite(topLeft.x + xDif, topLeft.y + yDif, STRUCTURE_RAMPART);
            }
        }
    }
}

export function placeMinerLinks(room: Room) {
    Object.keys(room.memory.miningAssignments).forEach((assignmentString) => {
        let assignmentPos = posFromMem(assignmentString);
        if (!assignmentPos.findInRange(FIND_MY_STRUCTURES, 1).find((structure) => structure.structureType === STRUCTURE_LINK)) {
            let looks = room.lookAtArea(assignmentPos.y - 1, assignmentPos.x - 1, assignmentPos.y + 1, assignmentPos.x + 1, true);
            let availableSpot = looks.find(
                (look) =>
                    look.terrain !== 'wall' &&
                    !looks.some(
                        (otherLook) => otherLook.x === look.x && otherLook.y === look.y && (otherLook.constructionSite || otherLook.structure)
                    )
            );

            room.createConstructionSite(availableSpot.x, availableSpot.y, STRUCTURE_LINK);
        }
    });
}
