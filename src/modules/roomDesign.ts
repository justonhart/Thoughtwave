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

interface IndustrialCenter {
    facing: Direction;
    storagePosition: string; //room position
}

const enum Direction {
    NORTH,
    EAST,
    SOUTH,
    WEST,
}
