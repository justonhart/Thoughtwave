import { posFromMem } from './memoryManagement';

export function findIndustryCenterLocation(room: Room) {
    //this find a good position for storage

    let pois = room.find(FIND_SOURCES).map((source) => source.pos);
    pois.push(room.controller.pos);

    let pointOfInterestSum = { x: 0, y: 0 };
    pois.forEach((pos) => {
        pointOfInterestSum.x += pos.x;
        pointOfInterestSum.y += pos.y;
    });

    let pointOfInterestAverage = new RoomPosition(pointOfInterestSum.x / pois.length, pointOfInterestSum.y / pois.length, room.name);

    let industryCenter = findClosestSuitablePosition(pointOfInterestAverage);

    room.visual.text('🌟', industryCenter[0].x, industryCenter[0].y);
    switch (industryCenter[1]) {
        case 0:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x + 1, industryCenter[0].y + 1],
                [industryCenter[0].x + 1, industryCenter[0].y + 2],
                [industryCenter[0].x, industryCenter[0].y + 2],
                [industryCenter[0].x - 1, industryCenter[0].y + 2],
                [industryCenter[0].x - 1, industryCenter[0].y + 1],
                industryCenter[0],
            ]);
            break;
        case 1:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x - 1, industryCenter[0].y + 1],
                [industryCenter[0].x - 2, industryCenter[0].y + 1],
                [industryCenter[0].x - 2, industryCenter[0].y],
                [industryCenter[0].x - 2, industryCenter[0].y - 1],
                [industryCenter[0].x - 1, industryCenter[0].y - 1],
                industryCenter[0],
            ]);
            break;
        case 2:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x - 1, industryCenter[0].y - 1],
                [industryCenter[0].x - 1, industryCenter[0].y - 2],
                [industryCenter[0].x, industryCenter[0].y - 2],
                [industryCenter[0].x + 1, industryCenter[0].y - 2],
                [industryCenter[0].x + 1, industryCenter[0].y - 1],
                industryCenter[0],
            ]);
            break;
        case 3:
            //@ts-ignore
            room.visual.poly([
                industryCenter[0],
                [industryCenter[0].x + 1, industryCenter[0].y + 1],
                [industryCenter[0].x + 2, industryCenter[0].y + 1],
                [industryCenter[0].x + 2, industryCenter[0].y],
                [industryCenter[0].x + 2, industryCenter[0].y - 1],
                [industryCenter[0].x + 1, industryCenter[0].y - 1],
                industryCenter[0],
            ]);
            break;
    }

    while (pois.length) {
        let path = industryCenter[0].findPathTo(pois.pop(), { swampCost: 1, ignoreDestructibleStructures: true, ignoreCreeps: true, range: 1 });

        //@ts-ignore
        room.visual.poly(path, { stroke: '#fff', strokeWidth: 0.15, opacity: 0.8, lineStyle: 'dotted' });
    }

    return industryCenter[1];
}

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

function findClosestSuitablePosition(startPos: RoomPosition): [RoomPosition, Direction] {
    let endPos: RoomPosition;
    let dir: Direction;
    let stop = false;

    let baseCheck = canPlaceIndustryCenter(startPos);
    if (baseCheck !== undefined) {
        return [startPos, baseCheck];
    }

    for (let lookDistance = 1; lookDistance < 10 && !stop; lookDistance++) {
        let lookPos: RoomPosition;
        let x: number, y: number;

        for (y = startPos.y - lookDistance; y <= startPos.y + lookDistance && !stop; y++) {
            for (x = startPos.x - lookDistance; x <= startPos.x + lookDistance && !stop; x++) {
                if (y > startPos.y - lookDistance && y < startPos.y + lookDistance && x > startPos.x - lookDistance) {
                    x = startPos.x + lookDistance;
                }
                lookPos = new RoomPosition(x, y, startPos.roomName);

                let check = canPlaceIndustryCenter(lookPos);
                if (check !== undefined) {
                    endPos = lookPos;
                    dir = check;
                    stop = true;
                }
            }
        }
    }

    return [endPos, dir];
}

function canPlaceIndustryCenter(pos: RoomPosition): Direction {
    let room = Game.rooms[pos.roomName];

    //NORTH
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 1, pos.x - 1, pos.y + 2, pos.x + 1, true).every((look) => look.terrain !== 'wall')) {
        return Direction.NORTH;
    }
    //EAST
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 1, pos.x - 2, pos.y + 1, pos.x + 1, true).every((look) => look.terrain !== 'wall')) {
        return Direction.EAST;
    }
    //SOUTH
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 2, pos.x - 1, pos.y + 1, pos.x + 1, true).every((look) => look.terrain !== 'wall')) {
        return Direction.SOUTH;
    }
    //WEST
    if (room.lookForAtArea(LOOK_TERRAIN, pos.y - 1, pos.x - 1, pos.y + 1, pos.x + 2, true).every((look) => look.terrain !== 'wall')) {
        return Direction.WEST;
    }

    return undefined;
}

export function findSquareLocation(room: Room): RoomPosition {
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
                        drawRoadsToBunker(room, starCenter);
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

export function getStructureForPos(layout: RoomLayout, targetPos: RoomPosition, referencePos: RoomPosition): BuildableStructureConstant {
    switch (layout) {
        case RoomLayout.SQUARE:
            let xdif = targetPos.x - referencePos.x;
            let ydif = targetPos.y - referencePos.y;

            if (targetPos === referencePos || Math.abs(xdif) >= 7 || Math.abs(ydif) >= 7) {
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
        case RoomLayout.SQUARE:
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

function getRoadsToBunker(hqPos: RoomPosition) {
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

export function drawRoadsToBunker(room: Room, hqPos?: RoomPosition) {
    if (!hqPos) {
        hqPos = posFromMem(room.memory.hqPos);
    }

    let paths = getRoadsToBunker(hqPos);

    paths.forEach((path) => {
        //@ts-ignore
        room.visual.poly(path, { stroke: '#fff', strokeWidth: 0.15, opacity: 0.8, lineStyle: 'dotted' });
    });
}

export function placeRoadsToBunker(room: Room, hqPos?: RoomPosition) {
    if (!hqPos) {
        hqPos = posFromMem(room.memory.hqPos);
    }

    let paths = getRoadsToBunker(hqPos);

    paths.forEach((path) => {
        //@ts-ignore
        path.forEach((step) => room.createConstructionSite(step.x, step.y, STRUCTURE_ROAD));
    });
}

function posInsideBunker(pos: RoomPosition, hqPos?: RoomPosition) {
    if (!hqPos) {
        hqPos = posFromMem(Game.rooms[pos.roomName].memory.hqPos);
    }

    return pos.x <= hqPos.x + 6 && pos.x >= hqPos.x - 6 && pos.y <= hqPos.y + 6 && pos.y >= hqPos.y - 6;
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

const enum Direction {
    NORTH,
    EAST,
    SOUTH,
    WEST,
}
