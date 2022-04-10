const MATRIX_COST_OFF_ROAD = 10; // Twice the cost of swamp terrain to avoid roads if possible
const AVOID_HOSTILES = 200; // Not 255 since sometimes a creep has no other choice
const MAX_STUCK_COUNT = 2; // If a creep can't move after two ticks, the path will be reevaluated
const MAX_STUCK_ROUTE = 5; // How long the path should be reused when stuck
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
        avoidHostiles: false,
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
        if (result === ERR_TIRED) {
            creep.memory._m.stuckCount = 0;
        }
        return result;
    }

    private move(
        creep: Creep,
        destination: RoomPosition,
        opts: TravelToOpts
    ): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        // Get Custom matrix if called otherwise use default
        if (opts.avoidHostiles || opts.avoidRoadOnLastMove || opts.avoidRoads) {
            opts.costCallback = this.getMatrix(opts, destination);
        }

        // Recalculate path with creeps in mind
        if (this.isSameDest(creep, destination) && (this.isStuck(creep, creep.memory._m.prevPos) || creep.memory._m.stuckCount >= MAX_STUCK_COUNT)) {
            creep.memory._m.stuckCount++;

            // First try pushing the creep in front closer to their target
            if (creep.memory._m.stuckCount === 1) {
                this.pushForward(creep);
            }
            // If creep is still stuck after two ticks find new path
            if (creep.memory._m.stuckCount >= MAX_STUCK_COUNT && creep.memory._m.stuckCount < MAX_STUCK_ROUTE) {
                opts.visualizePathStyle = { stroke: '#0000ff', opacity: 0.7, strokeWidth: 0.2, lineStyle: 'dashed' };
                opts.ignoreCreeps = false;
                opts.reusePath = 0;
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
     * CostCallback function to set avoid matrix.
     * This will execute every time the path needs to be recalculated (new room or reusePath is up)
     */
    private getMatrix(opts: TravelToOpts, destination?: RoomPosition) {
        return (roomName: string, costMatrix: CostMatrix) => {
            if (opts.avoidRoads) {
                // avoid all roads
                Game.rooms[roomName]
                    .find(FIND_STRUCTURES, { filter: (i) => i.structureType == STRUCTURE_ROAD })
                    .forEach((road) => costMatrix.set(road.pos.x, road.pos.y, MATRIX_COST_OFF_ROAD));
            } else if (opts.avoidRoadOnLastMove && roomName === destination.roomName) {
                // edge cases
                const avoidArea = this.getArea(destination, opts.range);
                // Avoid roads at specific destination
                Game.rooms[roomName]
                    .lookForAtArea(LOOK_STRUCTURES, avoidArea.top, avoidArea.left, avoidArea.bottom, avoidArea.right, true)
                    .filter((structure) => structure.structure.structureType === 'road')
                    .forEach((road) => costMatrix.set(road.x, road.y, MATRIX_COST_OFF_ROAD));
            }
            if (opts.avoidHostiles) {
                const room = Game.rooms[roomName];
                if (!room) return;
                room.find(FIND_HOSTILE_CREEPS, {
                    filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
                }).forEach((creep) => {
                    const avoidArea = this.getArea(creep.pos, 3);
                    for (let x = avoidArea.left; x <= avoidArea.right; x++) {
                        for (let y = avoidArea.top; y <= avoidArea.bottom; y++) {
                            costMatrix.set(x, y, AVOID_HOSTILES);
                        }
                    }
                });
            }
        };
    }

    private getArea(pos: RoomPosition, range: number) {
        const top = pos.y - range < 0 ? 0 : pos.y - range;
        const bottom = pos.y + range > 49 ? 49 : pos.y + range;
        const left = pos.x - range < 0 ? 0 : pos.x - range;
        const right = pos.x + range > 49 ? 49 : pos.x + range;
        return { top, left, bottom, right };
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
     * Creeps are able to push other creeps closer to their targets if possible.
     * See PriorityQueue implementation for task priority handling.
     *
     * @param creep -
     * @returns -
     */
    private pushForward(creep: Creep) {
        const nextPos = creep.memory._move?.path ? Room.deserializePath(creep.memory._move?.path)?.[0] : null;
        if (nextPos) {
            //check if creep is in nextPos
            const obstacleCreep = creep.room.lookForAt(LOOK_CREEPS, nextPos.x, nextPos.y)?.[0];
            if (obstacleCreep && obstacleCreep.memory._move?.path) {
                const obstacleNextPos = Room.deserializePath(obstacleCreep.memory._move?.path)?.[0];
                if (
                    !obstacleCreep.memory?._move?.dest ||
                    (obstacleNextPos && obstacleNextPos.x === creep.pos.x && obstacleNextPos.y === creep.pos.y)
                ) {
                    // Creep without a destination or creeps that are going to switch places are exempt (creeps without destination could be changed to just move in a random direction?)
                    return;
                }
                const obstacleCreepDest = this.normalizeDestination(obstacleCreep.memory._move?.dest);
                const forwardPath = obstacleCreep.pos.findPathTo(obstacleCreepDest, { maxOps: 100 })?.[0];
                if (
                    !forwardPath ||
                    obstacleCreep.pos.getRangeTo(obstacleCreepDest) <
                        new RoomPosition(forwardPath.x, forwardPath.y, obstacleCreep.room.name).getRangeTo(obstacleCreepDest)
                ) {
                    return; // Do not switch if it causes the creep that is in the way to move away from his target
                }
                obstacleCreep.addTaskToPriorityQueue(Priority.MEDIUM, () => {
                    obstacleCreep.move(forwardPath.direction);
                });
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
