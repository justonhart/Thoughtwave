import { posFromMem } from '../modules/memoryManagement';

//@ts-ignore
global.IN_ROOM = -20;

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
        avoidRoadOnLastMove: false,
        avoidHostileRooms: true,
        reusePath: 50,
        avoidHostiles: false,
        maxOps: 20000,
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
        let options = this.defaultOpts;
        if (opts) {
            options = { ...options, ...opts }; // Enable overriding any default options
        }

        // TODO: save reusePath in creep memory to force new path calculation (decrease it by one every time)
        if (!options.reusePath && creep.memory._m?.path) {
            delete creep.memory._m.path; // Always recalculate path
        }

        const roomPosition = Pathing.normalizePos(destination);

        try {
            var result = this.move(creep, roomPosition, options);
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
            creep.memory._m = {};
        }

        if (creep.fatigue > 0) {
            new RoomVisual(creep.pos.roomName).circle(creep.pos, {
                radius: 0.45,
                fill: 'transparent',
                stroke: 'aqua',
                strokeWidth: 0.15,
                opacity: 0.3,
            });
            return ERR_TIRED;
        }

        if (destination.toMemSafe() !== creep.memory._m.destination) {
            creep.memory._m.destination = destination.toMemSafe();
        }

        if (creep.memory._m.path) {
            // Creep has moved so remove nextDirection from memory
            if (!this.isStuck(creep, posFromMem(creep.memory._m.lastCoord))) {
                creep.memory._m.path = creep.memory._m.path.slice(1);
            } else {
                // First try pushing the creep in front closer to their target
                if (!this.pushForward(creep)) {
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
        }

        // Recalculate path in each new room as well if the creep should avoid hostiles in each room
        if (!creep.memory._m.path || (opts.avoidHostiles && this.isExit(creep.pos))) {
            //console.log(`${creep.name} in ${creep.pos.toMemSafe} is looking for new path.`);
            let pathFinder = this.findTravelPath(creep.pos, destination, this.getCreepMoveEfficiency(creep), opts);
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
                    pathFinder = this.findTravelPath(creep.pos, destination, this.getCreepMoveEfficiency(creep), this.defaultOpts); // Try to find path with default options (for example creeps could be blocking the target so this should at least find a path closer to the target)
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

            creep.memory._m.path = this.serializePath(creep.pos, pathFinder.path, { color: opts.pathColor, lineStyle: 'dashed' });
        }

        const nextDirection = parseInt(creep.memory._m.path[0], 10) as DirectionConstant;
        // If only one move is left then instantly get rid of it since above logic wont get executed
        if (creep.memory._m.path?.length === 1) {
            creep.memory._m.path = creep.memory._m.path.slice(1);
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
        return Memory.empire.hostileRooms?.includes(roomName);
    }
    //check if a position is an exit
    static isExit(pos: RoomPosition): boolean {
        return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
    }
    //check two coordinates match
    static sameCoord(pos1: RoomPosition, pos2: RoomPosition): boolean {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    }
    //check if two positions match
    static samePos(pos1: RoomPosition, pos2: RoomPosition) {
        return this.sameCoord(pos1, pos2) && pos1.roomName === pos2.roomName;
    }

    // add hostile rooms
    // TODO: add a timer to expire hostile rooms and if enemy attack creeps in room add it as well but with lower timer
    static addHostileRoom(room: Room, destinationRoom: string): void {
        if (!room) {
            return;
        }
        if (!Memory.empire.hostileRooms) {
            Memory.empire.hostileRooms = [];
        }
        // Find hostileRooms
        if (
            room.name !== destinationRoom &&
            !Memory.empire.hostileRooms.includes(room.name) &&
            room.find(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_TOWER })?.length
        ) {
            Memory.empire.hostileRooms.push(room.name);
        }
    }

    /**
     * Find path between two points
     * @param origin -
     * @param destination -
     * @param options -
     * @returns -
     */
    static findTravelPath(origin: HasPos | RoomPosition, destination: RoomPosition, efficiency: number, options: TravelToOpts = {}) {
        origin = this.normalizePos(origin);
        destination = this.normalizePos(destination);
        const range = this.ensureRangeIsInRoom(origin.roomName, destination, options.range);
        return PathFinder.search(
            origin,
            {
                pos: destination,
                range: range,
            },
            {
                maxOps: options.maxOps,
                plainCost: efficiency >= 2 ? 1 : 2,
                swampCost: efficiency >= 2 ? Math.ceil(10 / efficiency) : 10,
                roomCallback: this.getRoomCallback(origin.roomName, destination, options),
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
    static getRoomCallback(originRoom: string, destination: RoomPosition, options: TravelToOpts) {
        return (roomName: string) => {
            const room = Game.rooms[roomName];
            this.addHostileRoom(room, destination.roomName);
            if (options.avoidHostileRooms && Pathing.checkAvoid(roomName) && roomName !== destination.roomName) {
                return false;
            }

            let matrix: CostMatrix;
            if (room) {
                if (options.ignoreStructures) {
                    matrix = new PathFinder.CostMatrix();
                    if (!options.ignoreCreeps) {
                        Pathing.addCreepsToMatrix(room, matrix);
                    }
                } else if (options.ignoreCreeps || roomName !== originRoom) {
                    matrix = this.getStructureMatrix(room, options);
                } else {
                    matrix = this.getCreepMatrix(room);
                }

                if (options.avoidRoadOnLastMove && roomName === originRoom) {
                    // edge cases
                    matrix = matrix.clone();
                    const avoidArea = this.getArea(destination, options.range);
                    // Avoid roads at specific destination
                    room.lookForAtArea(LOOK_STRUCTURES, avoidArea.top, avoidArea.left, avoidArea.bottom, avoidArea.right, true)
                        .filter((structure) => structure.structure.structureType === STRUCTURE_ROAD)
                        .forEach((road) => matrix.set(road.x, road.y, 0xff));
                }

                if (options.avoidHostiles && roomName === originRoom) {
                    matrix = matrix.clone();
                    room.find(FIND_HOSTILE_CREEPS, {
                        filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
                    }).forEach((creep) => {
                        const avoidArea = this.getArea(creep.pos, 3);
                        for (let x = avoidArea.left; x <= avoidArea.right; x++) {
                            for (let y = avoidArea.top; y <= avoidArea.bottom; y++) {
                                matrix.set(x, y, 0xc8);
                            }
                        }
                    });
                }
            }

            return matrix;
        };
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
        const roadcost = 1; // Could be configurable later to avoid roads
        if (!this.structureMatrixTick) {
            this.structureMatrixTick = {};
        }

        if (!this.structureMatrixCache[room.name]) {
            this.structureMatrixCache[room.name] = {};
        }
        if (
            !this.structureMatrixCache[room.name][roadcost] ||
            (options && options.freshMatrix && Game.time !== this.structureMatrixTick[room.name])
        ) {
            this.structureMatrixTick[room.name] = Game.time;
            this.structureMatrixCache[room.name][roadcost] = Pathing.addStructuresToMatrix(room, new PathFinder.CostMatrix(), roadcost);
        }
        return this.structureMatrixCache[room.name][roadcost];
    }

    /**
     * Costmatrix for creep + structures
     * @param room current room (needs visibility)
     * @returns new Costmatrix
     */
    static getCreepMatrix(room: Room): CostMatrix {
        if (!this.creepMatrixTick) {
            this.creepMatrixTick = {};
        }
        if (!this.creepMatrixCache[room.name] || Game.time !== this.creepMatrixTick[room.name]) {
            this.creepMatrixTick[room.name] = Game.time;
            this.creepMatrixCache[room.name] = Pathing.addCreepsToMatrix(room, this.getStructureMatrix(room, { freshMatrix: true }).clone());
        }
        return this.creepMatrixCache[room.name];
    }

    /**
     * Costmatrix for structures
     * @param room current room (needs visibility)
     * @param matrix costmatrix to which to add the structure cost
     * @param roadCost cost for traveling on roads
     * @returns changed costmatrix
     */
    static addStructuresToMatrix(room: Room, matrix: CostMatrix, roadCost: number): CostMatrix {
        let impassibleStructures = [];
        for (let structure of room.find(FIND_STRUCTURES)) {
            if (structure.structureType === STRUCTURE_RAMPART) {
                if (!structure.my && !structure.isPublic) {
                    impassibleStructures.push(structure);
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
        return lastCoord && (this.sameCoord(creep.pos, lastCoord) || (this.isExit(creep.pos) && this.isExit(lastCoord)));
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
                // Check if Creeps are going past each other
                if (obstacleCreep.memory._m.path) {
                    const obstacleNextDirection = parseInt(obstacleCreep.memory._m.path[0], 10) as DirectionConstant;
                    if (this.inverseDirection(nextDirection) === obstacleNextDirection) {
                        // In most cases there is no need to override the task as it should be the same but sometimes creeps start doing their task with a last step in their path. This prevents a deadlock
                        obstacleCreep.addTaskToPriorityQueue(obstacleCreep.memory.currentTaskPriority + 1, () => {
                            obstacleCreep.move(obstacleNextDirection);
                        });
                    }
                }

                // Find Path closer to target
                const obstaclePathFinder = this.findTravelPath(
                    obstacleCreep.pos,
                    posFromMem(obstacleCreep.memory._m?.destination),
                    this.getCreepMoveEfficiency(obstacleCreep),
                    { ignoreCreeps: false, range: 1 }
                );
                // Push the obstacleCreep closer to their target (set always higher priority)
                if (obstaclePathFinder?.path?.length > 0) {
                    delete obstacleCreep.memory._m?.path; // Recalculate path after being pushed
                    obstacleCreep.addTaskToPriorityQueue(obstacleCreep.memory.currentTaskPriority + 1, () => {
                        obstacleCreep.move(obstacleCreep.pos.getDirectionTo(obstaclePathFinder.path[0]));
                    });
                    return true;
                } else if (creep.memory.currentTaskPriority > obstacleCreep.memory.currentTaskPriority) {
                    // Swap places if priority matches
                    delete obstacleCreep.memory._m?.path; // Recalculate path after being pushed
                    obstacleCreep.addTaskToPriorityQueue(creep.memory.currentTaskPriority, () => {
                        obstacleCreep.move(this.inverseDirection(nextDirection));
                    });
                    return true;
                }
            }
        }
        return false;
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
}
