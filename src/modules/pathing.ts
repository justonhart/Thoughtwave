const MATRIX_COST_OFF_ROAD = 10; // Twice the cost of swamp terrain to avoid roads if possible
const MAX_STUCK_COUNT = 2; // If a creep can't move after two ticks, the path will be reevaluated

export class Pathing {
    // Store roads for each room
    private static roadStructuresCache: { [roomName: string]: Coord[] } = {};
    private static defaultOpts: TravelToOpts = {
        ignoreCreeps: true,
        avoidRoads: false,
        priority: Priority.MEDIUM,
        avoidRoadOnLastMove: false,
        reusePath: 10,
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

        // Set task Priority
        creep.memory.currentTaskPriority = options.priority;

        let roomPosition = this.normalizePos(destination);

        try {
            var result = this.move(creep, roomPosition, options);
        } catch (e) {
            // In case something goes horribly wrong (example: someone manually deleted the creep memory)
            console.log(`Error caught in ${creep.name} for TravelTo. Fallback to default MoveTo function. Error: \n${e}`);
            result = creep.moveTo(destination, opts);
        }
        creep.memory._move.prevCoords = { x: creep.pos.x, y: creep.pos.y }; // Store coordinates to see if a creep is being blocked
        return result;
    }

    private static move(
        creep: Creep,
        destination: RoomPosition,
        opts: TravelToOpts = this.defaultOpts
    ): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        const prevCoords = creep.memory._move.prevCoords ?? creep.pos;
        const stuckCount = creep.memory._move.stuckCount ?? 0;

        // Set custom TravelTo options
        if (opts.avoidRoads) {
            opts.costCallback = this.getAvoidRoadsMatrix();
        } else if (opts.avoidRoadOnLastMove) {
            opts.costCallback = this.getAvoidRoadsMatrix(destination, opts.range);
        }

        // Recalculate path with creeps in mind
        if (this.isStuck(creep, prevCoords)) {
            creep.memory._move.stuckCount++;
            // If creep is still stuck after two ticks find new path
            if (stuckCount >= MAX_STUCK_COUNT) {
                opts.visualizePathStyle = { stroke: '#0000ff', opacity: 0.7, strokeWidth: 0.2, lineStyle: 'dashed' };
                opts.ignoreCreeps = false;
                opts.reusePath = 5;
                return creep.moveTo(destination, opts); // TODO: can be deleted --> simply set options if stuck and have moveTo at end (might have to delete current move set in memory)
            }
        } else {
            creep.memory._move.stuckCount = 0; // Reset stuckCount
        }

        // Default
        return creep.moveTo(destination, opts);
    }

    /**
     * CostCallback function to avoid matrix
     *
     */
    private static getAvoidRoadsMatrix(destination?: RoomPosition, range?: number) {
        return (roomName: string, costMatrix: CostMatrix) => {
            if (!destination) {
                // avoid all roads
                Pathing.getRoadStructures(roomName).forEach((road) => costMatrix.set(road.x, road.y, MATRIX_COST_OFF_ROAD));
            } else if (roomName === destination.roomName) {
                // edge cases
                const top = destination.y - range < 0 ? 0 : destination.y - range;
                const bottom = destination.y + range > 49 ? 49 : destination.y + range;
                const left = destination.x - range ? 0 : destination.x - range;
                const right = destination.x + range ? 49 : destination.x + range;

                // Avoid roads at specific destination
                Game.rooms[destination.roomName]
                    .lookForAtArea(LOOK_STRUCTURES, top, left, bottom, right, true)
                    .filter((structure) => structure.structure.structureType === 'road')
                    .forEach((road) => costMatrix.set(road.x, road.y, MATRIX_COST_OFF_ROAD));
            }
        };
    }

    /**
     * Check if the creep hasn't moved from his last coordinates
     * Fatigue will not count towards being stuck
     *
     * @param creep -
     * @param prevCoords -
     * @returns
     */
    private static isStuck(creep: Creep, prevCoords: Coord): boolean {
        if (!prevCoords || creep.fatigue > 0) {
            return false;
        }
        if (this.sameCoord(creep.pos, prevCoords)) {
            return true;
        }
        return false;
    }

    /**
     * Check if the two coordinates are the same
     *
     * @param pos1 -
     * @param pos2 -
     * @returns
     */
    private static sameCoord(pos1: Coord, pos2: Coord): boolean {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    }

    /**
     * Store all road coordinates in room memory to save cpu time
     * TODO: Manually adding roads cant trigger this logik (maybe save tick time as well and periodically update this ==> say every 100 ticks or so)
     *
     * @param roomName -
     * @param forceUpdate in case of new construction (should not be called every tick)
     * @returns
     */
    private static getRoadStructures(roomName: string, forceUpdate?: boolean): Coord[] {
        if (!this.roadStructuresCache[roomName] || forceUpdate) {
            this.roadStructuresCache[roomName] = Game.rooms[roomName]
                .find(FIND_STRUCTURES, { filter: (i) => i.structureType == STRUCTURE_ROAD })
                .map((road) => road.pos);
        }
        return this.roadStructuresCache[roomName];
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
