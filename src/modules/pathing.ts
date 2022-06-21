import { posFromMem } from '../modules/memoryManagement';

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

        if (destination.toMemSafe() !== creep.memory._m.destination) {
            delete creep.memory._m.path;
            creep.memory._m.destination = destination.toMemSafe();
        }

        // Stuck Logic
        if (!Pathing.isStuck(creep, posFromMem(creep.memory._m.lastCoord))) {
            creep.memory._m.stuckCount = 0;
            // TODO: Info last moveset will not be removed as this logik is only run when a creep is still traveling
            if (creep.memory._m.path) {
                creep.memory._m.path = creep.memory._m.path.slice(1);
            }
        } else {
            creep.memory._m.stuckCount++;
        }

        const cpuBefore = Game.cpu.getUsed();
        if (creep.memory._m.path && creep.memory._m.stuckCount) {
            // First try pushing the creep in front closer to their target (stayOnPath will not recalculate new Path)
            if (!Pathing.pushForward(creep) || creep.memory._m.stuckCount > 1) {
                creep.memory._m.repath++;
                opts.pathColor = 'blue';
                opts.ignoreCreeps = false;
                opts.preferRamparts = false;
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
            //console.log(`${creep.name} in ${creep.pos.toMemSafe} is looking for new path.`);
            creep.memory._m.visibleRooms = []; // Reset
            let pathFinder = Pathing.findTravelPath(creep.name, creep.pos, destination, Pathing.getCreepMoveEfficiency(creep), opts);
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
                    pathFinder = Pathing.findTravelPath(creep.name, creep.pos, destination, Pathing.getCreepMoveEfficiency(creep), {
                        ...Pathing.defaultOpts,
                        range: opts.range,
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

            creep.memory._m.path = Pathing.serializePath(creep.pos, pathFinder.path, { color: opts.pathColor, lineStyle: 'dashed' });
            creep.memory._m.stuckCount = 0;
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
            opts.avoidSourceKeepers &&
            creep.memory._m.lastCoord &&
            posFromMem(creep.memory._m.lastCoord).roomName !== creep.pos.roomName &&
            !creep.memory._m.visibleRooms.includes(creep.pos.roomName)
        ) {
            delete creep.memory._m.path; // Recalculate path in each new room as well if the creep should avoid hostiles in each room
        }
        return creep.move(nextDirection);
    }

    static isSameDest(creep: Creep, destination: RoomPosition) {
        return JSON.stringify(posFromMem(creep.memory._m.destination)) === JSON.stringify(destination);
    }

    /**
     * Get Move Efficiency to properly calculate the costMatrix.
     * @param creep -
     * @returns
     */
    static getCreepMoveEfficiency(creep: Creep): number {
        let totalreduction = 0;
        let totalparts = 0;
        let used = creep.store.getUsedCapacity();
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
        if (Memory.empire.hostileRooms) {
            const hostileRoom = Memory.empire.hostileRooms.find((hostileRoom) => hostileRoom.room === roomName);
            if (
                Memory.rooms &&
                Object.values(Memory.rooms).find((room) => room.remoteAssignments?.[roomName]?.state === RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS)
            ) {
                return true; // avoid homeBases mining rooms with enemies in them
            }
            if (hostileRoom) {
                if (hostileRoom.expireAt > Game.time) {
                    return true;
                }
                Memory.empire.hostileRooms.splice(Memory.empire.hostileRooms.indexOf(hostileRoom), 1); // Cleanup expired rooms
            }
            return false;
        }
        return false;
    }
    //check if a position is an exit
    static isExit(pos: RoomPosition): boolean {
        return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
    }
    //check two coordinates match
    static sameCoord(pos1: RoomPosition, pos2: RoomPosition): boolean {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    }

    // add hostile rooms
    static addHostileRoom(room: Room, destinationRoom: string, ignoreDestination?: boolean): void {
        if (!room) {
            return;
        }
        if (!Memory.empire.hostileRooms) {
            Memory.empire.hostileRooms = [];
        }
        // Find hostileRooms
        if (
            (ignoreDestination || room.name !== destinationRoom) &&
            !Memory.empire.hostileRooms.find((hostileRoom) => hostileRoom.room === room.name) &&
            room.find(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_TOWER })?.length &&
            room.controller?.owner
        ) {
            Memory.empire.hostileRooms.push({ room: room.name, expireAt: Game.time + 8000 }); // valid for 8000 Ticks right now (can be changed depending on room situation ==> invaders or players controller level)
        }
    }

    /**
     * Find path between two points
     * @param origin -
     * @param destination -
     * @param options -
     * @returns -
     */
    static findTravelPath(
        creepName: string,
        origin: HasPos | RoomPosition,
        destination: RoomPosition,
        efficiency: number,
        options: TravelToOpts = {}
    ) {
        origin = Pathing.normalizePos(origin);
        destination = Pathing.normalizePos(destination);
        const range = Pathing.ensureRangeIsInRoom(origin.roomName, destination, options.range);
        if (origin.roomName !== destination.roomName && !options.allowedRooms) {
            const roomDistance = Game.map.getRoomLinearDistance(origin.roomName, destination.roomName);
            if (roomDistance > 2) {
                const route = this.findRoute(origin.roomName, destination.roomName, options);
                if (route !== ERR_NO_PATH) {
                    options.allowedRooms = route;
                }
            }
        }
        if (options.preferRoadConstruction || options.preferRamparts) {
            efficiency = 0.8; // Make other tiles cost more to avoid multiple roads
        }
        return PathFinder.search(
            origin,
            {
                pos: destination,
                range: range,
            },
            {
                maxOps: options.maxOps,
                plainCost: Math.ceil(2 / efficiency),
                swampCost: Math.ceil(10 / efficiency),
                roomCallback: Pathing.getRoomCallback(origin.roomName, destination, options, creepName),
                flee: options.flee,
                maxRooms: options.maxRooms,
            }
        );
    }

    /**
     * Create proper costMatrix for each room
     * @param originRoom -
     * @param destionationRoom -
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

            const room = Game.rooms[roomName];
            Pathing.addHostileRoom(room, destination.roomName, options.checkForHostilesAtDestination);
            if (options.avoidHostileRooms && roomName !== originRoom && roomName !== destination.roomName && Pathing.checkAvoid(roomName)) {
                return false;
            }

            let matrix: CostMatrix;
            if (room) {
                if (!Memory.creeps[creepName]._m.visibleRooms.includes(room.name)) {
                    Memory.creeps[creepName]._m.visibleRooms.push(room.name);
                }
                if (options.ignoreStructures) {
                    matrix = new PathFinder.CostMatrix();
                    if (!options.ignoreCreeps) {
                        Pathing.addCreepsToMatrix(room, matrix);
                    }
                } else if (options.ignoreCreeps || roomName !== originRoom) {
                    matrix = Pathing.getStructureMatrix(room, options);
                } else {
                    matrix = Pathing.getCreepMatrix(room);
                }

                if (options.avoidSourceKeepers) {
                    matrix = matrix.clone();
                    if (room.find(FIND_STRUCTURES).some((struct) => struct.structureType === STRUCTURE_KEEPER_LAIR)) {
                        room.find(FIND_HOSTILE_CREEPS, {
                            filter: (creep) =>
                                creep.owner.username === 'Source Keeper' &&
                                (creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0),
                        }).forEach((creep) => {
                            const avoidArea = Pathing.getArea(creep.pos, 3);
                            for (let x = avoidArea.left; x <= avoidArea.right; x++) {
                                for (let y = avoidArea.top; y <= avoidArea.bottom; y++) {
                                    matrix.set(x, y, 0xc8);
                                }
                            }
                        });
                    }
                }

                if (options.exitCost) {
                    matrix = matrix.clone();
                    for (let x = 0; x < 50; x++) {
                        if (!Game.map.getRoomTerrain(roomName).get(x, 0)) {
                            matrix.set(x, 0, options.exitCost);
                        }
                        if (!Game.map.getRoomTerrain(roomName).get(x, 49)) {
                            matrix.set(x, 49, options.exitCost);
                        }
                    }
                    for (let y = 0; y < 50; y++) {
                        if (!Game.map.getRoomTerrain(roomName).get(0, y)) {
                            matrix.set(0, y, options.exitCost);
                        }
                        if (!Game.map.getRoomTerrain(roomName).get(49, y)) {
                            matrix.set(49, y, options.exitCost);
                        }
                    }
                }
                if (Memory.rooms[room.name]?.anchorPoint || Memory.rooms[room.name]?.managerPos) {
                    let managerPos = posFromMem(room.memory.anchorPoint || room.memory.managerPos);
                    matrix.set(managerPos.x, managerPos.y, 10);
                }

                if (Memory.rooms[room.name]?.miningAssignments) {
                    Object.keys(room.memory.miningAssignments)
                        .map((pos) => posFromMem(pos))
                        .forEach((pos) => {
                            matrix.set(pos.x, pos.y, 10);
                        });
                }

                // All tiles will be set to one if there is a road construction so that it counts as a finished road
                if (options.preferRoadConstruction) {
                    matrix = matrix.clone();
                    room.find(FIND_MY_CONSTRUCTION_SITES, { filter: (struct) => struct.structureType === STRUCTURE_ROAD }).forEach((struct) =>
                        matrix.set(struct.pos.x, struct.pos.y, 1)
                    );
                }

                if (options.preferRamparts) {
                    matrix = matrix.clone();
                    room.find(FIND_MY_STRUCTURES, { filter: (struct) => struct.structureType === STRUCTURE_RAMPART }).forEach((rampart) => {
                        matrix.set(rampart.pos.x, rampart.pos.y, 1);
                    });
                }

                if (options.customMatrixCosts) {
                    matrix = matrix.clone();
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
                    return Infinity;
                }
                const isMyRoom = Game.rooms[roomName] && Game.rooms[roomName].controller && Game.rooms[roomName].controller.my;
                if (isMyRoom) {
                    return 1;
                }
                if (options.preferHighway) {
                    const parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName) as unknown;
                    const isHighway = parsed[1] % 10 === 0 || parsed[2] % 10 === 0;
                    if (isHighway) {
                        return 1;
                    }
                }
                return 1.5;
            },
        });
        if (route === ERR_NO_PATH) {
            console.log(`Could not findRoute to ${destination}`);
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
        for (let structure of room.find(FIND_STRUCTURES)) {
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
        for (let site of room.find(FIND_MY_CONSTRUCTION_SITES)) {
            if (site.structureType === STRUCTURE_CONTAINER || site.structureType === STRUCTURE_ROAD || site.structureType === STRUCTURE_RAMPART) {
                continue;
            }
            matrix.set(site.pos.x, site.pos.y, 0xff);
        }

        return matrix;
    }
    //add creeps to matrix so that they will be avoided by other creeps
    static addCreepsToMatrix(room: Room, matrix: CostMatrix): CostMatrix {
        room.find(FIND_CREEPS).forEach((creep) => matrix.set(creep.pos.x, creep.pos.y, 0xff));
        return matrix;
    }
    //serialize a path, Pathing style. Returns a string of directions.
    static serializePath(startPos: RoomPosition, path: RoomPosition[], lineStyle?: LineStyle): string {
        let serializedPath = '';
        let lastPosition = startPos;
        for (let position of path) {
            if (position.roomName === lastPosition.roomName) {
                if (lineStyle) {
                    new RoomVisual(position.roomName).line(position, lastPosition, lineStyle);
                }
                serializedPath += lastPosition.getDirectionTo(position);
            }
            lastPosition = position;
        }
        return serializedPath;
    }

    static getArea(pos: RoomPosition, range: number) {
        const top = pos.y - range < 0 ? 0 : pos.y - range;
        const bottom = pos.y + range > 49 ? 49 : pos.y + range;
        const left = pos.x - range < 0 ? 0 : pos.x - range;
        const right = pos.x + range > 49 ? 49 : pos.x + range;
        return { top, left, bottom, right };
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
    static pushForward(creep: Creep): boolean {
        if (creep.memory._m.path) {
            const nextDirection = parseInt(creep.memory._m.path[0], 10) as DirectionConstant;
            //check if creep is in nextPos
            const obstacleCreep = creep.pos.findInRange(FIND_MY_CREEPS, 1, { filter: (c) => creep.pos.getDirectionTo(c) === nextDirection })[0];
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

                const obstacleCreepDestination = posFromMem(obstacleCreep.memory._m.destination);
                // Swap places if creep is closer to the destination than the obstacleCreep
                if (obstacleCreep.pos.getRangeTo(obstacleCreepDestination) >= creep.pos.getRangeTo(obstacleCreepDestination)) {
                    return Pathing.moveObstacleCreep(obstacleCreep, Pathing.inverseDirection(nextDirection));
                }

                // Find Path closer to target
                const obstaclePathFinder = Pathing.findTravelPath(
                    obstacleCreep.name,
                    obstacleCreep.pos,
                    obstacleCreepDestination,
                    Pathing.getCreepMoveEfficiency(obstacleCreep),
                    { ignoreCreeps: false, range: 1 }
                );
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
                return Pathing.moveObstacleCreep(obstacleCreep, nextDirection);
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
}
