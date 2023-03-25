const MAPPING = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function createRoad(startPos: RoomPosition, endPos: RoomPosition, opts?: RoadOpts): ScreepsReturnCode{

    if(opts === undefined){
        opts = {};
    }

    if(opts?.allowedStatuses === undefined){
        opts.allowedStatuses = [RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.VACANT, RoomMemoryStatus.OWNED_ME];
    }

    if(opts?.ignoreOtherRoads === undefined){
        opts.ignoreOtherRoads = false;
    }

    const pathSearch = PathFinder.search(
        startPos,
        endPos,
        {
            plainCost: (2 * ROAD_DECAY_AMOUNT) / REPAIR_POWER,
            swampCost: (2 * ROAD_DECAY_AMOUNT * 5) / REPAIR_POWER,
            roomCallback: (roomName: string) => {
                if (
                    !opts.allowedStatuses.includes(
                        Memory.roomData[roomName]?.roomStatus
                    )
                ) {
                    return false;
                }

                let matrix = new PathFinder.CostMatrix();

                if (Memory.roomData[roomName]?.roomStatus === RoomMemoryStatus.OWNED_ME) {
                    Game.rooms[roomName].stamps?.road.forEach((r) => {
                        matrix.set(r.pos.x, r.pos.y, 1);
                    });
                }

                if (!opts.ignoreOtherRoads) {
                    let roads = Memory.roomData[roomName]?.roads ? Object.values(Memory.roomData[roomName].roads) : [];
                    if (roads?.length) {
                        roads.forEach(roadCode => {
                            try{
                                decodeRoad(roadCode, roomName).forEach(pos => matrix.set(pos.x, pos.y, 1))
                            } catch (e){
                                console.log("error decoding road: " + roadCode + " : " + roomName);
                            }
                        });
                    }
                }

                return matrix;
            },
            maxOps: 10000,
        }
    );

    if(pathSearch.incomplete){
        return ERR_NOT_FOUND;
    }

    const path = pathSearch.path;
    const roadKey = `${startPos.toMemSafe()}:${endPos.toMemSafe()}`;
    
    const encodedRoadSegments = encodeRoad(path);
    encodedRoadSegments.forEach(segment => {

        if(!Memory.roomData[segment.roomName].roads){
            Memory.roomData[segment.roomName].roads = {};
        }

        Memory.roomData[segment.roomName].roads[roadKey] = segment.roadCode;
    })

    return OK;
}

//decode a road for a given room
export function decodeRoad(roadString: string, roomName: string): RoomPosition[]{
    let arr = [];
    for(let i = 0; i < roadString.length; i += 2){
        arr.push(new RoomPosition(decode(roadString.charAt(i)), decode(roadString.charAt(i+1)), roomName));
    }
    return arr;
}

//takes in a single path, and returns an array of codes mapped to their room names
function encodeRoad(road: RoomPosition[]): {roomName: string, roadCode: string}[] {
    let roadCodes = [];

    const pathRooms = Array.from(new Set(road.map(pos => pos.roomName)));
    pathRooms.forEach(roomName => {
        let roadCode = '';
        road.filter(step => step.roomName === roomName).forEach(step => {
            
            let stepCode = encode(step.x) + encode(step.y);
            roadCode += stepCode;
        });
        roadCodes.push({roomName: roomName, roadCode: roadCode});
    });

    return roadCodes;
}

//separate road into contiguous segments
function getRoadSegments(road: RoomPosition[]): RoomPosition[][]{
    let startingIndices = [0];
    let segments = [];
    for(let i = 1; i < road.length; i++){
        if (!road[i].isNearTo(road[i-1])){
            startingIndices.push(i);
        }
    }

    for(let i = 0; i < startingIndices.length; i++){
        if(i === startingIndices.length - 1){
            segments.push(road.slice(startingIndices[i]));
        } else {
            segments.push(road.slice(startingIndices[i], startingIndices[i+1]));
        }
    }

    return segments;
}

function decode(char: string): number{
    return MAPPING.indexOf(char);
}

function encode(int: number): string{
    return MAPPING.charAt(int);
}

function posExistsOnRoad(pos: RoomPosition): boolean{
    let roads = Object.values(Memory.roomData[pos.roomName].roads).map(roadCode => decodeRoad(roadCode, pos.roomName));

    return roads.some(road => road.some(roadPos => roadPos === pos));
}