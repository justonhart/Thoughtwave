import { isKeeperRoom, isHighway } from '../modules/data';
import { getArea } from './misc';
import { decodeRoad, getRoadPathFromPos } from './roads';

//@ts-ignore
global.IN_ROOM = -20;

const REPORT_CPU_THRESHOLD = 500;
/**
 * Quick overview of the different visuals.
 * Visuals:
 *   Circle:
 *     Aqua: Creep is fatigued
 *     Green: Creep is pushing obstacle away
 *     Orange: Path with given options could not be found
 *     Red: Path with default options coul not be found
 *   Line:
 *     Orange: Normal Path
 *     Blue: New Path after being stuck
 *
 */
export class Pathing {
    private static structureMatrixCache: { [roomName: string]: { [roadCost: number]: CostMatrix } } = {};
    private static creepMatrixCache: { [roomName: string]: CostMatrix } = {};
    private static creepMatrixTick: { [roomName: string]: number } = {};
    private static structureMatrixTick: { [roomName: string]: number } = {};

    // Store roads for each room
    private static defaultOpts: TravelToOpts = {
        ignoreCreeps: true,
        avoidRoads: false,
        avoidHostileRooms: true,
        reusePath: 50,
        avoidSourceKeepers: true,
        maxOps: 10000,
        preferHighway: true,
        range: 0,
        pathColor: 'orange',
    };

    /**
     * Method to replace the default "moveTo" function
     *
     * @param creep
     * @param destination
     * @param opts
     * @returns
     */
    public static travelTo(
        creep: Creep,
        destination: HasPos | RoomPosition,
        opts?: TravelToOpts
    ): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        const options = { ...Pathing.defaultOpts, ...opts }; // Enable overriding any default options
        // TODO: save reusePath in creep memory to force new path calculation (decrease it by one every time)
        if (!options.reusePath && creep.memory._m?.path) {
            delete creep.memory._m.path; // Always recalculate path
        }

        // PowerCreep got moved by another creep
        if (creep instanceof PowerCreep && creep.memory._m?.repath) {
            creep.memory._m.repath = 0;
            return;
        }

        const roomPosition = Pathing.normalizePos(destination);

        try {
            var result = Pathing.move(creep, roomPosition, options);
        } catch (e) {
            // In case something goes horribly wrong (example: someone manually deleted the creep memory)
            console.log(`Error caught in ${creep.name} for TravelTo. Error: \n${e}`);
        }
        if (result === OK) {
            creep.memory._m.lastCoord = creep.pos.toMemSafe(); // Store coordinates to see if a creep is being blocked
        }

        return result;
    }

    static move(creep: Creep, destination: RoomPosition, opts: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        if (!creep.memory._m) {
            creep.memory._m = { stuckCount: 0, repath: 0 };
        }

        if (creep.fatigue > 0) {
            creep.memory._m.stuckCount = 0;
            new RoomVisual(creep.pos.roomName).circle(creep.pos, {
                radius: 0.45,
                fill: 'transparent',
                stroke: 'aqua',
                strokeWidth: 0.15,
                opacity: 0.3,
            });
            return ERR_TIRED;
        }

        creep.memory._m.lastMove = Game.time;

        // Destination changed or PowerCreep got moved by another creep
        if (destination.toMemSafe() !== creep.memory._m.destination) {
            delete creep.memory._m.path;
            creep.memory._m.repath = 0;
            creep.memory._m.destination = destination.toMemSafe();
        }

        // Stuck Logic
        if (!Pathing.isStuck(creep, creep.memory._m.lastCoord?.toRoomPos())) {
            creep.memory._m.stuckCount = 0;
            if (creep.memory._m.path) {
                creep.memory._m.path = creep.memory._m.path.slice(1);
            }
        } else {
            creep.memory._m.stuckCount++;
        }

        const cpuBefore = Game.cpu.getUsed();
        if (creep.memory._m.path && creep.memory._m.stuckCount) {
            // First try pushing the creep in front closer to their target (stayOnPath will not recalculate new Path)
            if (!Pathing.pushForward(creep, opts) || creep.memory._m.stuckCount > 1) {
                // When on edge keep path around creep to avoid going back and forth on the exit
                creep.memory._m.keepPath = true;
                creep.memory._m.repath++;
                opts.pathColor = 'blue';
                opts.ignoreCreeps = false;
                delete creep.memory._m.path; // recalculate path (for now this will be used all the way till the target...could implement a recalculate after n ticks method to go back to original path after getting unstuck)
            } else {
                new RoomVisual(creep.pos.roomName).circle(creep.pos, {
                    radius: 0.45,
                    fill: 'transparent',
                    stroke: 'green',
                    strokeWidth: 0.15,
                    opacity: 0.3,
                });
            }
        }

        if (!creep.memory._m.path) {
            creep.memory._m.visibleRooms = []; // Reset
            if (!opts.efficiency && (opts.preferRoadConstruction || opts.preferRamparts)) {
                opts.efficiency = 0.8; // Make other tiles cost more
            } else if (!opts.efficiency) {
                opts.efficiency = Pathing.getCreepMoveEfficiency(creep, opts.currentTickEnergy);
            }

            let pathFinder: any;

            if (opts.useMemoryRoads && Memory.roomData[creep.room.name].roads && creep.memory._m.stuckCount < 3) {
                const roadsToDestination = Object.entries(Memory.roomData[creep.room.name].roads).filter(([key, value]) =>
                    key.includes(destination.toMemSafe())
                );
                if (roadsToDestination.length) {
                    let roadThruCurrentPos = roadsToDestination.find(([key, value]) =>
                        decodeRoad(value, creep.room.name).some((pos) => pos.isEqualTo(creep.pos))
                    );
                    //if pos on road to destination, store directions from current pos in mem
                    if (roadThruCurrentPos) {
                        pathFinder = { path: getRoadPathFromPos(roadThruCurrentPos[0], creep.pos, destination.toMemSafe()) };
                        opts.pathColor = 'green';
                    } else {
                        let roadPositions = _.flatten(roadsToDestination.map(([key, value]) => decodeRoad(value, creep.room.name)));
                        //else find path to nearest pos on road
                        pathFinder = PathFinder.search(creep.pos, roadPositions, {
                            roomCallback: Pathing.getRoomCallback(creep.room.name, roadPositions.shift(), {}, creep.name),
                        });
                        opts.pathColor = 'red';
                    }
                }
            }

            //path could be empty if the creep is at the end of the road
            if (!pathFinder?.path?.length) {
                pathFinder = Pathing.findTravelPath(creep, creep.pos, destination, opts);
                if (pathFinder.incomplete) {
                    // This can happen often ==> for example when "ignoreCreeps: false" was given and creeps are around the destination. Path close to target will still get serialized so not an issue.
                    new RoomVisual(creep.pos.roomName).circle(creep.pos, {
                        radius: 0.45,
                        fill: 'transparent',
                        stroke: 'orange',
                        strokeWidth: 0.15,
                        opacity: 0.3,
                    });
                    if (!pathFinder.path) {
                        // Not even a partial path was found (for example close to the target but blocked by creeps)
                        pathFinder = Pathing.findTravelPath(creep, creep.pos, destination, {
                            ...Pathing.defaultOpts,
                            range: opts.range,
                            efficiency: opts.efficiency,
                        }); // Try to find path with default options (for example creeps could be blocking the target so this should at least find a path closer to the target)
                        if (!pathFinder.path) {
                            // Error (hopefully shouldn't happen)
                            new RoomVisual(creep.pos.roomName).circle(creep.pos, {
                                radius: 0.45,
                                fill: 'transparent',
                                stroke: 'red',
                                strokeWidth: 0.15,
                                opacity: 0.3,
                            });
                            console.log(`Could not find a path for ${creep.name}`);
                        }
                    }
                }
            }

            creep.memory._m.path = Pathing.serializePath(creep.pos, pathFinder.path, { color: opts.pathColor, lineStyle: 'dashed' });
            // Get all roomPositions along the path
            if (opts.pathsRoomPositions?.length === 0 && creep.memory._m.path?.length && !opts.avoidedTemporaryHostileRooms) {
                Array.prototype.push.apply(opts.pathsRoomPositions, pathFinder.path);
            }

            // Do not remove next path if instantly going back to old room
            if (
                !creep.memory._m.keepPath &&
                creep.memory._m.lastCoord &&
                creep.memory._m.path?.length &&
                Pathing.isExit(creep.memory._m.lastCoord?.toRoomPos()) &&
                (!Pathing.positionAtDirection(creep.pos, parseInt(creep.memory._m.path[0], 10) as DirectionConstant) ||
                    Pathing.isExit(Pathing.positionAtDirection(creep.pos, parseInt(creep.memory._m.path[0], 10) as DirectionConstant)))
            ) {
                creep.memory._m.keepPath = true;
            }
        }

        // Can be removed later but needed this for debugging
        const cpuUsed = Game.cpu.getUsed() - cpuBefore;
        if (cpuUsed > REPORT_CPU_THRESHOLD) {
            console.log(
                `Pathing: ${
                    creep.name
                } shows heavy cpu use. cpu: ${cpuUsed}, pos: ${creep.pos.toMemSafe()}, dest: ${destination.toMemSafe()}, opts: ${JSON.stringify(
                    opts
                )}`
            );
        }
        const nextDirection = parseInt(creep.memory._m.path[0], 10) as DirectionConstant;
        if (
            !creep.memory._m.keepPath &&
            creep.memory._m.lastCoord &&
            creep.memory._m.lastCoord?.toRoomPos().roomName !== creep.pos.roomName &&
            (creep.memory._m.onSegmentedPath || (opts.avoidSourceKeepers && !creep.memory._m.visibleRooms.includes(creep.pos.roomName)))
        ) {
            delete creep.memory._m.path; // Recalculate path in each new room as well if the creep should avoid hostiles in each room
        } else if (creep.memory._m.lastCoord && creep.memory._m.lastCoord?.toRoomPos().roomName !== creep.pos.roomName && creep.memory._m.keepPath) {
            creep.memory._m.keepPath = false;
        }
        return creep.move(nextDirection);
    }

    static isSameDest(creep: Creep, destination: RoomPosition) {
        return JSON.stringify(creep.memory._m.destination?.toRoomPos()) === JSON.stringify(destination);
    }

    /**
     * Get Move Efficiency to properly calculate the costMatrix.
     * @param creep -
     * @returns
     */
    static getCreepMoveEfficiency(creep: Creep, currentTickEnergy?: number): number {
        if (creep instanceof PowerCreep) {
            return 1;
        }
        let totalreduction = 0;
        let totalparts = 0;
        let used = creep.store.getUsedCapacity();
        if (currentTickEnergy) {
            used += currentTickEnergy;
        }
        creep.body.forEach((body) => {
            switch (body.type) {
                case MOVE:
                    totalreduction += body.hits > 0 ? -2 : 0; // Each MOVE reduces fatigue by 2
                    break;
                case CARRY:
                    if (used > 0 && body.hits > 0) {
                        used -= CARRY_CAPACITY;
                        totalparts += 1; // CARRY will only count if in use
                    }
                    break;
                default: // Other body parts
                    totalparts += 1;
                    break;
            }
        });
        return totalparts > 0 ? 0 - totalreduction / totalparts : totalreduction;
    }
    //check if room should be avoided
    static checkAvoid(roomName: string): boolean {
        if (Memory.roomData[roomName]?.hostile && Memory.roomData[roomName].asOf < Game.time + 10000) {
            return true;
        }

        if (Memory.remoteData[roomName]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            return true;
        }
        return false;
    }
    //check if a position is an exit
    static isExit(pos: RoomPosition): boolean {
        return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
    }
    //check two coordinates match
    static sameCoord(pos1: RoomPosition, pos2: RoomPosition): boolean {
        return pos1.isEqualTo(pos2);
    }

    /**
     * Find path between two points
     * @param origin -
     * @param destination -
     * @param options -
     * @returns -
     */
    static findTravelPath(creep: Creep, origin: HasPos | RoomPosition, destination: RoomPosition, options: TravelToOpts = {}) {
        origin = Pathing.normalizePos(origin);
        destination = Pathing.normalizePos(destination);
        const range = Pathing.ensureRangeIsInRoom(origin.roomName, destination, options.range);
        let goals = [];
        if (origin.roomName !== destination.roomName && !options.allowedRooms) {
            const route = this.findRoute(origin.roomName, destination.roomName, options);
            if (route !== ERR_NO_PATH) {
                options.allowedRooms = route;
            }
            if (options.allowedRooms?.length >= 3) {
                // Long Route so only find detailed path for the first 4 rooms. This also avoids issues with creeps getting stuck against 1 wide walls.
                goals = [
                    {
                        pos: new RoomPosition(25, 25, options.allowedRooms[2]),
                        range: 24,
                    },
                ];
                creep.memory._m.onSegmentedPath = true; // Recalculate on every new room for the current/next room. This is done to optimize Pathing (knows the optimal exit to take)
            }
        }

        if (!goals.length) {
            goals = [
                {
                    pos: destination,
                    range: range,
                },
            ];
            goals.concat(options.goals);
            delete creep.memory._m.onSegmentedPath;
        }

        return PathFinder.search(origin, goals, {
            maxOps: options.maxOps,
            plainCost: Math.ceil(2 / options.efficiency),
            swampCost: Math.ceil(10 / options.efficiency),
            roomCallback: Pathing.getRoomCallback(origin.roomName, destination, options, creep.name),
            flee: options.flee,
            maxRooms: options.maxRooms,
        });
    }

    /**
     * Create proper costMatrix for each room
     * @param originRoom -
     * @param destination -
     * @param options -
     * @returns -
     */
    static getRoomCallback(originRoom: string, destination: RoomPosition, options: TravelToOpts, creepName: string) {
        return (roomName: string) => {
            if (options.allowedRooms) {
                if (!options.allowedRooms.includes(roomName)) {
                    return false;
                }
            }

            if (options.avoidHostileRooms && roomName !== originRoom && roomName !== destination.roomName && Pathing.checkAvoid(roomName)) {
                if (!Memory.roomData[roomName]?.owner) {
                    // Hostile but not owned room
                    options.avoidedTemporaryHostileRooms = true;
                }
                return false;
            }

            let matrix: CostMatrix;
            const room = Game.rooms[roomName];
            if (room) {
                if (Memory.creeps[creepName] && !Memory.creeps[creepName]._m.visibleRooms.includes(room.name)) {
                    Memory.creeps[creepName]._m.visibleRooms.push(room.name);
                }
                if (options.ignoreStructures) {
                    matrix = new PathFinder.CostMatrix();
                    if (!options.ignoreCreeps) {
                        Pathing.addCreepsToMatrix(room, matrix);
                    }
                } else if (options.ignoreCreeps) {
                    matrix = Pathing.getStructureMatrix(room, options);
                } else {
                    matrix = Pathing.getCreepMatrix(room);
                }

                matrix = matrix.clone();
                if (options.avoidSourceKeepers && isKeeperRoom(room.name)) {
                    const terrain = Game.map.getRoomTerrain(roomName);
                    room.hostileCreeps
                        .filter(
                            (creep) =>
                                creep.owner.username === 'Source Keeper' &&
                                (creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0)
                        )
                        .forEach((creep) => {
                            const avoidArea = getArea(creep.pos, 3);
                            for (let x = avoidArea.left; x <= avoidArea.right; x++) {
                                for (let y = avoidArea.top; y <= avoidArea.bottom; y++) {
                                    if ((x !== destination.x || y !== destination.y) && terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                                        matrix.set(x, y, 50);
                                    }
                                }
                            }
                        });
                }

                if (options.exitCost) {
                    const terrain = Game.map.getRoomTerrain(roomName);
                    for (let x = 0; x < 50; x++) {
                        Pathing.setMatrixIfNotWall(terrain, matrix, x, 0, options.exitCost);
                        Pathing.setMatrixIfNotWall(terrain, matrix, x, 49, options.exitCost);
                    }
                    for (let y = 0; y < 50; y++) {
                        Pathing.setMatrixIfNotWall(terrain, matrix, 0, y, options.exitCost);
                        Pathing.setMatrixIfNotWall(terrain, matrix, 49, y, options.exitCost);
                    }
                }

                if (options.avoidEdges) {
                    const terrain = Game.map.getRoomTerrain(roomName);
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
                }

                room.memory.stampLayout?.managers.forEach((managerStamp) => {
                    if (!Pathing.sameCoord(managerStamp.pos.toRoomPos(), destination) || Memory.creeps[creepName]?.role !== Role.MANAGER) {
                        matrix.set(managerStamp.pos.toRoomPos().x, managerStamp.pos.toRoomPos().y, 50);
                    }
                });

                if (Memory.rooms[room.name]?.miningAssignments) {
                    Object.keys(room.memory.miningAssignments)
                        .map((pos) => pos?.toRoomPos())
                        .filter((pos) => pos.x !== destination.x || pos.y !== destination.y)
                        .forEach((pos) => {
                            matrix.set(pos.x, pos.y, 50);
                        });
                }

                if (Memory.rooms[room.name]?.mineralMiningAssignments) {
                    Object.keys(room.memory.mineralMiningAssignments)
                        .map((pos) => pos?.toRoomPos())
                        .filter((pos) => pos.x !== destination.x || pos.y !== destination.y)
                        .forEach((pos) => {
                            matrix.set(pos.x, pos.y, 50);
                        });
                }

                // All tiles will be set to one if there is a road construction so that it counts as a finished road.
                if (options.preferRoadConstruction && options.ignoreCreeps) {
                    // Include road in memory even if not yet build
                    if (Memory.roomData[room.name].roads) {
                        Object.values(Memory.roomData[room.name].roads).forEach((road) =>
                            road.split(',').forEach((pos) => matrix.set(parseInt(pos.split(':')[0]), parseInt(pos.split(':')[1]), 1))
                        );
                    }
                    room.myConstructionSites
                        .filter((struct) => struct.structureType === STRUCTURE_ROAD)
                        .forEach((struct) => matrix.set(struct.pos.x, struct.pos.y, 1));
                }

                if (options.preferRamparts) {
                    room.myStructures
                        .filter((struct) => struct.structureType === STRUCTURE_RAMPART)
                        .forEach((rampart) => {
                            const costAtPos = matrix.get(rampart.pos.x, rampart.pos.y);
                            if (!costAtPos || (costAtPos > 1 && costAtPos < 255)) {
                                matrix.set(rampart.pos.x, rampart.pos.y, 2); // Ramparts without roads and walkable
                            }
                        });
                }

                if (options.customMatrixCosts) {
                    options.customMatrixCosts.forEach((matrixCost) => matrix.set(matrixCost.x, matrixCost.y, matrixCost.cost));
                }
            }

            return matrix;
        };
    }

    public static findRoute(originRoom: string, destination: string, options: TravelToOpts): string[] | ERR_NO_PATH {
        let allowedRooms = [originRoom];
        const route = Game.map.findRoute(originRoom, destination, {
            routeCallback: (roomName) => {
                if (options.avoidHostileRooms && roomName !== originRoom && roomName !== destination && Pathing.checkAvoid(roomName)) {
                    if (Memory.roomData[roomName] && !Memory.roomData[roomName].owner) {
                        // Hostile but not owned room
                        options.avoidedTemporaryHostileRooms = true;
                    }
                    return Infinity;
                }
                const isRemoteMiningRoom = Memory.remoteData[roomName];
                if (Game.rooms[roomName]?.controller?.my || isRemoteMiningRoom) {
                    return 1;
                }
                if (options.preferHighway) {
                    if (isHighway(roomName)) {
                        return 1;
                    }
                }
                if (isKeeperRoom(roomName)) {
                    return 2;
                }
                return 1.5;
            },
        });
        if (route === ERR_NO_PATH) {
            console.log(`Could not findRoute to ${destination} from ${originRoom}`);
            return ERR_NO_PATH;
        }
        route.forEach((routeStep) => allowedRooms.push(routeStep.room));

        return allowedRooms;
    }

    static ensureRangeIsInRoom(originRoom: string, destination: RoomPosition, range: number): number {
        if (originRoom !== destination.roomName && range > 1) {
            if (destination.x + range > 48) {
                range = destination.x === 49 ? 0 : 48 - destination.x;
            } else if (destination.y + range > 48) {
                range = destination.x === 49 ? 0 : 48 - destination.y;
            } else if (range >= destination.x) {
                range = destination.x > 0 ? destination.x - 1 : 0;
            } else if (range >= destination.y) {
                range = destination.y > 0 ? destination.y - 1 : 0;
            }
        }
        return range;
    }

    /**
     * Create new costmatrix based on the room and the provided options
     * @param room current room (need visibility)
     * @param options set proper roadcost
     * @returns new costmatrix
     */
    static getStructureMatrix(room: Room, options: TravelToOpts): CostMatrix {
        let roadcost = 1; // Could be configurable later to avoid roads
        if (!Pathing.structureMatrixTick) {
            Pathing.structureMatrixTick = {};
        }

        if (!Pathing.structureMatrixCache[room.name]) {
            Pathing.structureMatrixCache[room.name] = {};
        }
        if (
            !Pathing.structureMatrixCache[room.name][roadcost] ||
            (options && options.freshMatrix && Game.time !== Pathing.structureMatrixTick[room.name])
        ) {
            Pathing.structureMatrixTick[room.name] = Game.time;
            Pathing.structureMatrixCache[room.name][roadcost] = Pathing.addStructuresToMatrix(room, new PathFinder.CostMatrix(), roadcost);
        }
        return Pathing.structureMatrixCache[room.name][roadcost];
    }

    /**
     * Costmatrix for creep + structures
     * @param room current room (needs visibility)
     * @returns new Costmatrix
     */
    static getCreepMatrix(room: Room): CostMatrix {
        if (!Pathing.creepMatrixTick) {
            Pathing.creepMatrixTick = {};
        }
        if (!Pathing.creepMatrixCache[room.name] || Game.time !== Pathing.creepMatrixTick[room.name]) {
            Pathing.creepMatrixTick[room.name] = Game.time;
            Pathing.creepMatrixCache[room.name] = Pathing.addCreepsToMatrix(room, Pathing.getStructureMatrix(room, { freshMatrix: true }).clone());
        }
        return Pathing.creepMatrixCache[room.name];
    }

    /**
     * Costmatrix for structures
     * @param room current room (needs visibility)
     * @param matrix costmatrix to which to add the structure cost
     * @param roadCost cost for traveling on roads
     * @returns changed costmatrix
     */
    static addStructuresToMatrix(room: Room, matrix: CostMatrix, roadCost: number): CostMatrix {
        for (let structure of room.structures) {
            if (structure.structureType === STRUCTURE_RAMPART) {
                if (!structure.my) {
                    // Even if isPublic to avoid maze trap
                    matrix.set(structure.pos.x, structure.pos.y, 0xff);
                }
            } else if (structure.structureType === STRUCTURE_ROAD) {
                if (matrix.get(structure.pos.x, structure.pos.y) < 0xff) {
                    matrix.set(structure.pos.x, structure.pos.y, roadCost);
                }
            } else {
                if (structure.structureType !== STRUCTURE_CONTAINER) {
                    matrix.set(structure.pos.x, structure.pos.y, 0xff);
                }
            }
        }
        for (let site of room.myConstructionSites) {
            if (site.structureType === STRUCTURE_CONTAINER || site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_RAMPART) {
                continue;
            }
            matrix.set(site.pos.x, site.pos.y, 0xff);
        }

        return matrix;
    }
    //add creeps to matrix so that they will be avoided by other creeps
    static addCreepsToMatrix(room: Room, matrix: CostMatrix): CostMatrix {
        room.myCreeps.forEach((creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff));
        room.hostileCreeps.forEach((creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff));
        return matrix;
    }
    //serialize a path, Pathing style. Returns a string of directions.
    static serializePath(startPos: RoomPosition, path: RoomPosition[], lineStyle?: LineStyle): string {
        let serializedPath = '';
        let lastPosition = startPos;

        for (let position of path) {
            if (lastPosition.getDirectionTo(position) === undefined) console.log(lastPosition + ' -> ' + position);
            if (position.roomName === lastPosition.roomName && !position.isEqualTo(lastPosition)) {
                if (lineStyle) {
                    new RoomVisual(position.roomName).line(position, lastPosition, lineStyle);
                }
                serializedPath += lastPosition.getDirectionTo(position);
            }
            lastPosition = position;
        }
        return serializedPath;
    }

    static normalizeDestination(destination: Destination): RoomPosition {
        if (!destination) {
            return null;
        }
        return new RoomPosition(destination.x, destination.y, destination.room);
    }

    /**
     * Check if the creep hasn't moved from his last coordinates or creep is on an exit
     * Fatigue will not count towards being stuck
     *
     * @param creep -
     * @param prevCoords -
     * @returns
     */
    static isStuck(creep: Creep, lastCoord: RoomPosition): boolean {
        return lastCoord && (Pathing.sameCoord(creep.pos, lastCoord) || (Pathing.isExit(creep.pos) && Pathing.isExit(lastCoord)));
    }

    /**
     * Creeps are able to push other creeps closer to their targets if possible.
     * See PriorityQueue implementation for task priority handling.
     *
     * @param creep -
     * @returns -
     */
    static pushForward(creep: Creep, opts: TravelToOpts): boolean {
        if (creep.memory._m.path) {
            const nextDirection = parseInt(creep.memory._m.path[0], 10) as DirectionConstant;
            //check if creep is in nextPos
            const obstacleCreep = creep.room.myCreeps.find(
                (c) => creep.id !== c.id && creep.pos.isNearTo(c) && creep.pos.getDirectionTo(c) === nextDirection
            );
            if (obstacleCreep?.memory?._m?.destination) {
                obstacleCreep.memory._m.repath++; // Since pushing a creep can mess with the path
                if (obstacleCreep.memory._m?.path?.length > 1) {
                    if (!obstacleCreep.fatigue && obstacleCreep.memory._m?.lastMove < Game.time - 2) {
                        // idle creep
                        const nextDirection = parseInt(obstacleCreep.memory._m.path[0], 10);
                        obstacleCreep.memory._m.path = obstacleCreep.memory._m.path.slice(1);
                        return Pathing.moveObstacleCreep(obstacleCreep, nextDirection as DirectionConstant);
                    }
                    return true;
                }

                const obstacleCreepDestination = obstacleCreep.memory._m.destination?.toRoomPos();
                // Swap places if creep is closer to the destination than the obstacleCreep
                if (obstacleCreep.pos.getRangeTo(obstacleCreepDestination) >= creep.pos.getRangeTo(obstacleCreepDestination)) {
                    return Pathing.moveObstacleCreep(obstacleCreep, Pathing.inverseDirection(nextDirection));
                }

                // Do not allow pushing
                if (opts.noPush && obstacleCreep.memory.currentTaskPriority >= opts.noPush) {
                    return false;
                }

                // Find Path closer to target
                const obstaclePathFinder = Pathing.findTravelPath(obstacleCreep, obstacleCreep.pos, obstacleCreepDestination, {
                    ignoreCreeps: false,
                    range: 1,
                    efficiency: Pathing.getCreepMoveEfficiency(obstacleCreep),
                });
                // Push the obstacleCreep closer to their target (set always higher priority)
                if (
                    obstaclePathFinder?.path?.length > 0 &&
                    obstacleCreep.pos.getRangeTo(obstacleCreepDestination) >= obstaclePathFinder.path[0].getRangeTo(obstacleCreepDestination)
                ) {
                    return Pathing.moveObstacleCreep(obstacleCreep, obstacleCreep.pos.getDirectionTo(obstaclePathFinder.path[0]));
                } else if (creep.memory.currentTaskPriority > obstacleCreep.memory.currentTaskPriority) {
                    // Swap places if creep has a higher priorty
                    return Pathing.moveObstacleCreep(obstacleCreep, Pathing.inverseDirection(nextDirection));
                }
            } else if (obstacleCreep) {
                if (!obstacleCreep.memory._m) {
                    obstacleCreep.memory._m = { repath: 0 };
                }
                obstacleCreep.memory._m.repath++; // Since pushing a creep can mess with the path
                return Pathing.moveObstacleCreep(obstacleCreep, Pathing.inverseDirection(nextDirection));
            } else {
                const powerCreepObstacle = creep.room.myPowerCreeps.find(
                    (powerCreep) => creep.pos.isNearTo(powerCreep) && creep.pos.getDirectionTo(powerCreep) === nextDirection
                );
                if (powerCreepObstacle) {
                    // @ts-ignore
                    powerCreepObstacle.memory._m.repath++;
                    powerCreepObstacle.move(Pathing.inverseDirection(nextDirection));
                }
            }
        }
        return false;
    }

    static moveObstacleCreep(obstacleCreep: Creep, direction: DirectionConstant) {
        obstacleCreep.addTaskToPriorityQueue(Priority.HIGH, () => {
            obstacleCreep.move(direction);
        });
        return true;
    }

    /**
     * There are 8 directions 1-8. The opposite direction is always a difference of 4. Since the first direction is 1 we simply add 1 to the entire function.
     * @param direction -
     * @returns
     */
    static inverseDirection(direction: DirectionConstant): DirectionConstant {
        return (((direction + 3) % 8) + 1) as DirectionConstant;
    }

    /**
     * make position objects consistent so that either can be used as an argument
     * @param destination
     * @returns {any}
     */
    static normalizePos(destination: HasPos | RoomPosition): RoomPosition {
        if (!(destination instanceof RoomPosition)) {
            return destination.pos;
        }
        return destination;
    }

    static positionAtDirection(origin: RoomPosition, direction: DirectionConstant): RoomPosition {
        const offsetX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
        const offsetY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
        const x = origin.x + offsetX[direction];
        const y = origin.y + offsetY[direction];
        if (x > 49 || x < 0 || y > 49 || y < 0) {
            return;
        }
        return new RoomPosition(x, y, origin.roomName);
    }

    static setMatrixIfNotWall(terrain: RoomTerrain, matrix: CostMatrix, x: number, y: number, cost: number) {
        if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
            matrix.set(x, y, cost);
        }
    }
}
