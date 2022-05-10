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
    let starCenter = new RoomPosition(poiAvg.x - 1, poiAvg.y + 1, room.name);

    let valid = checkBunkerBoundary(starCenter);

    if (!valid) {
        for (let lookDistance = 1; lookDistance < 50; lookDistance++) {
            let lookPos: RoomPosition;
            let x: number, y: number;

            for (y = starCenter.y - lookDistance; y <= starCenter.y + lookDistance && !valid; y++) {
                for (x = starCenter.x - lookDistance; x <= starCenter.x + lookDistance && !valid; x++) {
                    if (y > starCenter.y - lookDistance && y < starCenter.y + lookDistance && x > starCenter.x - lookDistance) {
                        x = starCenter.x + lookDistance;
                    }

                    // since the square is 13 wide, the center must be at least 7 tiles away from edges (cant build on x/y = 0/49 or in front of exits)
                    if (x > 8 && x < 42 && y > 8 && y < 42) {
                        lookPos = new RoomPosition(x, y, starCenter.roomName);

                        valid = checkBunkerBoundary(lookPos);
                    }
                    if (valid) {
                        starCenter = lookPos;
                        drawBunker(starCenter);
                        drawRoadsToPOIs(room, starCenter);
                    }
                }
            }
        }
    }

    return valid ? starCenter : undefined;
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
    roomVis.line(anchorPoint.x, anchorPoint.y - 3, anchorPoint.x, anchorPoint.y - 6);
    roomVis.line(anchorPoint.x + 3, anchorPoint.y, anchorPoint.x + 6, anchorPoint.y);
    roomVis.line(anchorPoint.x, anchorPoint.y + 3, anchorPoint.x, anchorPoint.y + 6);
    roomVis.line(anchorPoint.x - 3, anchorPoint.y, anchorPoint.x - 6, anchorPoint.y);
    roomVis.line(anchorPoint.x - 2 + 0.5, anchorPoint.y - 2 + 0.5, anchorPoint.x - 4, anchorPoint.y - 4);
    roomVis.line(anchorPoint.x + 2 - 0.5, anchorPoint.y - 2 + 0.5, anchorPoint.x + 4, anchorPoint.y - 4);
    roomVis.line(anchorPoint.x + 2 - 0.5, anchorPoint.y + 2 - 0.5, anchorPoint.x + 4, anchorPoint.y + 4);
    roomVis.line(anchorPoint.x - 2 + 0.5, anchorPoint.y + 2 - 0.5, anchorPoint.x - 4, anchorPoint.y + 4);

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
            let hqPos = posFromMem(room.memory.hqPos);
            return new RoomPosition(hqPos.x, hqPos.y - 1, room.name);
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

function getRoadsToPOIs(hqPos: RoomPosition) {
    let room = Game.rooms[hqPos.roomName];
    let pois: (Source | StructureController | Mineral)[] = [];

    pois.push(...room.find(FIND_SOURCES));
    pois.push(room.controller);
    pois.push(...room.find(FIND_MINERALS));

    let storagePos = new RoomPosition(hqPos.x + 1, hqPos.y - 1, hqPos.roomName);

    let paths = pois.map((poi) => {
        //if destination is a controller, range = 3 instead of 1

        //@ts-ignore
        let path = poi.my
            ? storagePos.findPathTo(poi, { swampCost: 5, ignoreDestructibleStructures: true, ignoreCreeps: true, range: 3 })
            : storagePos.findPathTo(poi, { swampCost: 5, ignoreDestructibleStructures: true, ignoreCreeps: true, range: 1 });

        //remove last step from path
        path.pop();

        //remove steps inside the bunker borders
        path = path.filter((step) => !posInsideBunker(new RoomPosition(step.x, step.y, room.name), hqPos));

        return path;
    });

    return paths;
}

export function drawRoadsToPOIs(room: Room, hqPos?: RoomPosition) {
    if (!hqPos) {
        hqPos = posFromMem(room.memory.hqPos);
    }

    let paths = getRoadsToPOIs(hqPos);

    paths.forEach((path) => {
        //@ts-ignore
        room.visual.poly(path, { stroke: '#fff', strokeWidth: 0.15, opacity: 0.8, lineStyle: 'dotted' });
    });
}

export function placeRoadsToPOIs(room: Room, anchorPoint?: RoomPosition) {
    if (!anchorPoint) {
        anchorPoint = posFromMem(room.memory.hqPos);
    }

    let paths = getRoadsToPOIs(anchorPoint);

    paths.forEach((path) => {
        //@ts-ignore
        path.forEach((step) => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
    });
}

function posInsideBunker(pos: RoomPosition, anchorPoint?: RoomPosition) {
    if (!anchorPoint) {
        anchorPoint = posFromMem(Game.rooms[pos.roomName].memory.hqPos);
    }

    return pos.x <= anchorPoint.x + 6 && pos.x >= anchorPoint.x - 6 && pos.y <= anchorPoint.y + 6 && pos.y >= anchorPoint.y - 6;
}

export function placeBunkerOuterRamparts(room: Room) {
    let anchor = posFromMem(room.memory.hqPos);

    let topLeft = new RoomPosition(anchor.x - 6, anchor.y - 6, room.name);
    for (let xDif = 0; xDif < 13; xDif++) {
        for (let yDif = 0; yDif < 13; yDif++) {
            if (yDif === 0 || xDif === 0 || yDif === 12 || xDif === 12) {
                room.createConstructionSite(topLeft.x + xDif, topLeft.y + yDif, STRUCTURE_RAMPART);
            }
        }
    }
}
