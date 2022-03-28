const MATRIX_COST_OFF_ROAD = 10; // Twice the cost of swamp terrain to avoid roads if possible
const MAX_STUCK_COUNT = 2; // If a creep can't move after two ticks, the path will be reevaluated
const MAX_STUCK_ROUTE = 7; // How long the path should be reused when stuck
//@ts-ignore
global.IN_ROOM = -20;

export class Pathing {
    // Store roads for each room
    private defaultOpts: TravelToOpts = {
        ignoreCreeps: true,
        avoidRoads: false,
        priority: Priority.MEDIUM,
        avoidRoadOnLastMove: false,
        reusePath: 30,
    };

    /**
     * Method to replace the default "moveTo" function
     *
     * @param creep
     * @param destination
     * @param opts
     * @returns
     */
    public travelTo(
        creep: Creep,
        destination: HasPos | RoomPosition,
        opts?: TravelToOpts
    ): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        let options = this.defaultOpts;
        if (opts) {
            options = { ...options, ...opts }; // Enable overriding any default options
        }

        // init memory
        if (!creep.memory._m) creep.memory._m = { stuckCount: 0 };

        // Set task Priority
        creep.memory.currentTaskPriority = options.priority;

        let roomPosition = Pathing.normalizePos(destination);

        try {
            var result = this.move(creep, roomPosition, options);
        } catch (e) {
            // In case something goes horribly wrong (example: someone manually deleted the creep memory)
            console.log(`Error caught in ${creep.name} for TravelTo. Fallback to default MoveTo function. Error: \n${e}`);
            result = creep.moveTo(destination, opts);
        }
        if (creep.memory._move?.dest) {
            creep.memory._m.prevPos = creep.pos; // Store coordinates to see if a creep is being blocked
        }
        return result;
    }

    private move(
        creep: Creep,
        destination: RoomPosition,
        opts: TravelToOpts
    ): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        // Set custom TravelTo options
        if (opts.avoidRoads) {
            opts.costCallback = this.getAvoidRoadsMatrix();
        } else if (opts.avoidRoadOnLastMove) {
            opts.costCallback = this.getAvoidRoadsMatrix(destination, opts.range);
        }

        // Recalculate path with creeps in mind
        if (this.isSameDest(creep, destination) && (this.isStuck(creep, creep.memory._m.prevPos) || creep.memory._m.stuckCount >= MAX_STUCK_COUNT)) {
            creep.memory._m.stuckCount++;

            // If creep is still stuck after two ticks find new path
            if (creep.memory._m.stuckCount >= MAX_STUCK_COUNT && creep.memory._m.stuckCount < MAX_STUCK_ROUTE) {
                opts.visualizePathStyle = { stroke: '#0000ff', opacity: 0.7, strokeWidth: 0.2, lineStyle: 'dashed' };
                opts.ignoreCreeps = false;
                opts.reusePath = MAX_STUCK_ROUTE;
                if (creep.memory._m.stuckCount === MAX_STUCK_COUNT) creep.memory._move = {}; // Reset current path
            }
            // Reset to avoid creeps
            if (creep.memory._m.stuckCount >= MAX_STUCK_ROUTE) {
                creep.memory._move = {};
                creep.memory._m.stuckCount = 0;
            }
        } else {
            creep.memory._m.stuckCount = 0; // Reset stuckCount
        }

        // Default
        return creep.moveTo(destination, opts);
    }

    private isSameDest(creep: Creep, destination: RoomPosition) {
        return JSON.stringify(this.normalizeDestination(creep.memory._move.dest)) === JSON.stringify(destination);
    }

    /**
     * CostCallback function to avoid matrix (this only runs when reusePath is used up)
     *
     */
    private getAvoidRoadsMatrix(destination?: RoomPosition, range?: number) {
        return (roomName: string, costMatrix: CostMatrix) => {
            if (!destination) {
                // avoid all roads
                Game.rooms[roomName]
                    .find(FIND_STRUCTURES, { filter: (i) => i.structureType == STRUCTURE_ROAD })
                    .forEach((road) => costMatrix.set(road.pos.x, road.pos.y, MATRIX_COST_OFF_ROAD));
            } else if (roomName === destination.roomName) {
                // edge cases
                const top = destination.y - range < 0 ? 0 : destination.y - range;
                const bottom = destination.y + range > 49 ? 49 : destination.y + range;
                const left = destination.x - range < 0 ? 0 : destination.x - range;
                const right = destination.x + range > 49 ? 49 : destination.x + range;

                // Avoid roads at specific destination
                Game.rooms[roomName]
                    .lookForAtArea(LOOK_STRUCTURES, top, left, bottom, right, true)
                    .filter((structure) => structure.structure.structureType === 'road')
                    .forEach((road) => costMatrix.set(road.x, road.y, MATRIX_COST_OFF_ROAD));
            }
        };
    }

    private normalizeDestination(destination: Destination): RoomPosition {
        if (!destination) {
            return null;
        }
        return new RoomPosition(destination.x, destination.y, destination.room);
    }

    /**
     * Check if the creep hasn't moved from his last coordinates
     * Fatigue will not count towards being stuck
     *
     * @param creep -
     * @param prevCoords -
     * @returns
     */
    private isStuck(creep: Creep, prevCoords: Coord): boolean {
        return prevCoords && creep.fatigue === 0 && creep.memory._move?.dest && this.sameCoord(creep.pos, prevCoords);
    }

    /**
     * Check if the two coordinates are the same
     *
     * @param pos1 -
     * @param pos2 -
     * @returns
     */
    private sameCoord(pos1: Coord, pos2: Coord): boolean {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    }

    /**
     * Creeps are able to shove other creeps in the opposite direction if they are not moving towards the same destination.
     * See PriorityQueue implementation for task priority handling.
     *
     * @param creep -
     * @returns -
     */
    private shoveAway(creep: Creep) {
        const path = Room.deserializePath(creep.memory._move.path);
        const nextPos = path ? path[0] : null;
        if (nextPos) {
            //check if creep is in nextPos
            const obstacleCreep = creep.room.lookForAt(LOOK_CREEPS, nextPos.x, nextPos.y);
            if (
                obstacleCreep.length &&
                (!obstacleCreep[0].memory._m || JSON.stringify(obstacleCreep[0].memory._move.dest) !== JSON.stringify(creep.memory._move.dest))
            ) {
                obstacleCreep[0].addTaskToPriorityQueue(Priority.MEDIUM, () => {
                    obstacleCreep[0].move(this.inverseDirection(nextPos.direction));
                }); // switch positions
            }
        }
    }

    /**
     * There are 8 directions 1-8. The opposite direction is always a difference of 4. Since the first direction is 1 we simply add 1 to the entire function.
     * @param direction -
     * @returns
     */
    private inverseDirection(direction: DirectionConstant): DirectionConstant {
        return (((direction + 3) % 8) + 1) as DirectionConstant;
    }

    /**
     * make position objects consistent so that either can be used as an argument
     * @param destination
     * @returns {any}
     */
    public static normalizePos(destination: HasPos | RoomPosition): RoomPosition {
        if (!(destination instanceof RoomPosition)) {
            return destination.pos;
        }
        return destination;
    }
}
