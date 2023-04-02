import { getBunkerPositions, getStructureForPos } from './data';

const MAPPING = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function getRoad(startPos: RoomPosition, endPos: RoomPosition, opts?: RoadOpts): PathFinderPath {
    if (opts === undefined) {
        opts = {};
    }

    if (opts?.allowedStatuses === undefined) {
        opts.allowedStatuses = [RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.VACANT, RoomMemoryStatus.OWNED_ME];
    }

    if (opts?.ignoreOtherRoads === undefined) {
        opts.ignoreOtherRoads = false;
    }

    const pathSearch = PathFinder.search(startPos, opts.destRange ? { range: opts.destRange, pos: endPos } : endPos, {
        plainCost: (2 * ROAD_DECAY_AMOUNT) / REPAIR_POWER,
        swampCost: (2 * ROAD_DECAY_AMOUNT * 5) / REPAIR_POWER,
        roomCallback: (roomName: string) => {
            if (
                roomName !== startPos.roomName &&
                roomName !== endPos.roomName &&
                !opts.allowedStatuses.includes(Memory.roomData[roomName]?.roomStatus)
            ) {
                return false;
            }

            let matrix = new PathFinder.CostMatrix();

            if (Memory.remoteData[roomName]) {
                let miningRoomsWithPos = Object.entries(Memory.remoteSourceAssignments).filter(
                    ([source, miningData]) => source.split('.')[2] === roomName
                );
                let miningPositions = miningRoomsWithPos.map(([source, miningData]) => {
                    let miningPos = Memory.rooms[miningData.controllingRoom].remoteSources[source].miningPos;
                    return miningPos;
                });
                miningPositions.forEach((pos) => matrix.set(pos.toRoomPos().x, pos.toRoomPos().y, 255));
            }

            if (Memory.roomData[roomName]?.roomStatus === RoomMemoryStatus.OWNED_ME) {
                if (Memory.rooms[roomName].layout === RoomLayout.BUNKER) {
                    getBunkerPositions(Game.rooms[roomName]).forEach((pos) =>
                        matrix.set(
                            pos.x,
                            pos.y,
                            getStructureForPos(RoomLayout.BUNKER, pos, Memory.rooms[roomName].anchorPoint.toRoomPos()) === STRUCTURE_ROAD ? 1 : 255
                        )
                    );
                } else if (Memory.rooms[roomName].layout === RoomLayout.STAMP) {
                    Object.entries(Game.rooms[roomName].stamps).forEach(([key, stampsDetails]: [string, StampDetail[]]) =>
                        stampsDetails.forEach((detail) => matrix.set(detail.pos.x, detail.pos.y, key === 'road' || key === 'rampart' ? 1 : 255))
                    );
                }
            }

            if (!opts.ignoreOtherRoads && Memory.roomData[roomName]?.roads) {
                let otherRoadKeys = Object.keys(Memory.roomData[roomName].roads).filter((k) => k !== `${startPos}:${endPos}`);
                let roads = otherRoadKeys.map((key) => Memory.roomData[roomName].roads[key]);
                if (roads.length) {
                    roads.forEach((roadCode) => {
                        try {
                            decodeRoad(roadCode, roomName).forEach((pos) => matrix.set(pos.x, pos.y, 1));
                        } catch (e) {
                            console.log('error decoding road: ' + roadCode + ' : ' + roomName);
                        }
                    });
                }
            }

            return matrix;
        },
        maxOps: 10000,
    });

    return pathSearch;
}

export function storeRoadInMemory(startPos: RoomPosition, endPos: RoomPosition, road: RoomPosition[]): ScreepsReturnCode {
    if (!startPos || !endPos || !road || !road.length) {
        return ERR_INVALID_ARGS;
    }

    const roadKey = `${startPos.toMemSafe()}:${endPos.toMemSafe()}`;

    try {
        const encodedRoadSegments = encodeRoad(road);
        encodedRoadSegments.forEach((segment) => {
            if (!Memory.roomData[segment.roomName].roads) {
                Memory.roomData[segment.roomName].roads = {};
            }

            Memory.roomData[segment.roomName].roads[roadKey] = segment.roadCode;
        });
    } catch (e) {
        console.log(`Error encoding road: ${startPos}:${endPos}`);
        return ERR_INVALID_ARGS;
    }

    return OK;
}

//decode a road for a given room
export function decodeRoad(roadString: string, roomName: string): RoomPosition[] {
    let arr = [];
    for (let i = 0; i < roadString.length; i += 2) {
        try {
            arr.push(new RoomPosition(decode(roadString.charAt(i)), decode(roadString.charAt(i + 1)), roomName));
        } catch (e) {
            console.log(`Error decoding road: ${roadString} - ${e}`);
            console.log(`${roadString.charAt(i)}${roadString.charAt(i + 1)} => ${decode(roadString.charAt(i))}.${decode(roadString.charAt(i + 1))}`);
        }
    }
    return arr;
}

//takes in a single path, and returns an array of codes mapped to their room names
function encodeRoad(road: RoomPosition[]): { roomName: string; roadCode: string }[] {
    let roadCodes = [];

    const pathRooms = Array.from(new Set(road.map((pos) => pos.roomName)));
    pathRooms.forEach((roomName) => {
        let roadCode = '';
        road.filter((step) => step.roomName === roomName).forEach((step) => {
            let stepCode = encode(step.x) + encode(step.y);
            roadCode += stepCode;
        });
        roadCodes.push({ roomName: roomName, roadCode: roadCode });
    });

    return roadCodes;
}

//separate road into contiguous segments
export function getRoadSegments(road: RoomPosition[]): RoomPosition[][] {
    let startingIndices = [0];
    let segments = [];
    for (let i = 1; i < road.length; i++) {
        if (!road[i].isNearTo(road[i - 1])) {
            startingIndices.push(i);
        }
    }

    for (let i = 0; i < startingIndices.length; i++) {
        if (i === startingIndices.length - 1) {
            segments.push(road.slice(startingIndices[i]));
        } else {
            segments.push(road.slice(startingIndices[i], startingIndices[i + 1]));
        }
    }

    return segments;
}

function decode(char: string): number {
    return MAPPING.indexOf(char);
}

function encode(int: number): string {
    return MAPPING.charAt(int);
}

//checks certain road for pos. If no road provided, checks all roads in room
export function posExistsOnRoad(pos: RoomPosition, roadKey?: string): boolean {
    if (!Memory.roomData[pos.roomName]?.roads) {
        return false;
    }
    let roadPositions: RoomPosition[] = roadKey
        ? decodeRoad(Memory.roomData[pos.roomName].roads[roadKey], pos.roomName)
        : _.flatten(Object.values(Memory.roomData[pos.roomName].roads).map((roadCode) => decodeRoad(roadCode, pos.roomName)));

    return roadPositions.some((roadPos) => roadPos.isEqualTo(pos));
}

//trace a road through all rooms from starting point to return RoomPosition array
export function getFullRoad(roadKey: string): RoomPosition[] {
    const startingRoomName = roadKey.split(':')[0].toRoomPos().roomName;
    const roadCode = Memory.roomData[startingRoomName].roads[roadKey];

    let road = decodeRoad(roadCode, startingRoomName);
    const segments = getRoadSegments(road);
    if (segments.length > 1) {
        road = segments[0];
    }

    let nextRoomName = Game.map.describeExits(startingRoomName)[getExitDirection(road[road.length - 1])];
    if (nextRoomName !== ERR_INVALID_ARGS) {
        return [...road, ...recursiveRoadGet(roadKey, nextRoomName, road[road.length - 1])];
    } else {
        return undefined;
    }
}

function recursiveRoadGet(roadKey: string, roomName: string, lastPos: RoomPosition): RoomPosition[] {
    const roadCode = Memory.roomData[roomName]?.roads[roadKey];
    if (!roadCode) {
        console.log(`Error tracing road ${roadKey} through ${roomName}`);
        return [];
    }

    let road = decodeRoad(roadCode, roomName);
    let segments = getRoadSegments(road);

    if (segments.length > 1) {
        let currentSegment = segments.find((seg) => Math.abs(seg[0].x - lastPos.x) <= 1 || Math.abs(seg[0].y - lastPos.y) <= 1);
        road = currentSegment;
    }

    let destination = roadKey.split(':')[1].toRoomPos();

    if (road[road.length - 1].isNearTo(destination)) {
        return road;
    } else {
        let nextRoomName = Game.map.describeExits(roomName)[getExitDirection(road[road.length - 1])];
        if (nextRoomName !== ERR_INVALID_ARGS) {
            return [...road, ...recursiveRoadGet(roadKey, nextRoomName, road[road.length - 1])];
        } else {
            return undefined;
        }
    }
}

function getExitDirection(exitPos: RoomPosition): DirectionConstant | ScreepsReturnCode {
    return exitPos.x === 0 ? LEFT : exitPos.x === 49 ? RIGHT : exitPos.y === 0 ? TOP : exitPos.y === 49 ? BOTTOM : ERR_INVALID_ARGS;
}

export function getAllRoadRooms(roadKey: string): string[] {
    return Array.from(new Set(getFullRoad(roadKey).map((pos) => pos.roomName)));
}

export function roadIsPaved(roadKey: string): boolean | ScreepsReturnCode {
    let road = getFullRoad(roadKey);
    let canSeeAllRooms = road.every((pos) => Game.rooms[pos.roomName]);
    if (canSeeAllRooms) {
        return road.every((pos) => pos.lookFor(LOOK_STRUCTURES).some((structure) => structure.structureType === STRUCTURE_ROAD));
    } else {
        return ERR_NOT_FOUND;
    }
}

export function roadIsSafe(roadKey: string) {
    return getAllRoadRooms(roadKey).every(
        (room) =>
            (Memory.roomData[room]?.hostile !== true && !Memory.remoteData[room]) ||
            Memory.remoteData[room]?.threatLevel < RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS
    );
}

export function deleteRoad(roadKey: string) {
    let roadRooms = Object.keys(Memory.roomData).filter((room) => Memory.roomData[room]?.roads?.[roadKey]);
    roadRooms.forEach((room) => delete Memory.roomData[room].roads[roadKey]);
}

export function getRoadPathFromPos(roadKey: string, startPos: RoomPosition, destination: string): RoomPosition[] {
    const fullRoad = getFullRoad(roadKey);
    const startPosIndex = fullRoad.findIndex((pos) => pos.isEqualTo(startPos));
    const direction = roadKey.split(':')[0] === destination ? -1 : 1;

    let path: RoomPosition[] = [];

    if (direction === 1) {
        path = fullRoad.slice(startPosIndex + 1);
    } else {
        path = fullRoad.slice(0, startPosIndex).reverse();
    }

    return path;
}

export function roadCodeContainsMultipleSegments(roadCode: string): boolean {
    for (let i = 2; i < roadCode.length; i += 2) {
        if (
            Math.abs(MAPPING.indexOf(roadCode[i - 2]) - MAPPING.indexOf(roadCode[i])) > 1 ||
            Math.abs(MAPPING.indexOf(roadCode[i - 1]) - MAPPING.indexOf(roadCode[i + 1])) > 1
        ) {
            return true;
        }
    }
    return false;
}
