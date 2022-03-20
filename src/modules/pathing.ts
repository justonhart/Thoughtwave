const MATRIX_COST_OFF_ROAD = 10; // Twice the cost of swamp terrain to avoid roads if possible
const MAX_STUCK_COUNT = 2; // If a creep can't move after two ticks, the path will be reevaluated

export class Pathing {
    // Store roads for each room
    private static roadStructuresCache: { [roomName: string]: Coord[] } = {};
    private static defaultOpts: TravelToOpts = { ignoreCreeps: true, avoidRoads: false, reusePath: 10 };

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
        let result = this.move(creep, destination, options);
        creep.memory._move.prevCoords = { x: creep.pos.x, y: creep.pos.y }; // Store coordinates to see if a creep is being blocked
        return result;
    }

    private static move(
        creep: Creep,
        destination: HasPos | RoomPosition,
        opts: TravelToOpts = this.defaultOpts
    ): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND {
        let prevCoords = creep.memory._move.prevCoords ?? creep.pos;
        let stuckCount = creep.memory._move.stuckCount ?? 0;

        // Set custom TravelTo options
        if (opts.avoidRoads) {
            this.addAvoidRoadCostMatrix(opts);
        }

        // Recalculate path with creeps in mind
        if (this.isStuck(creep, prevCoords)) {
            creep.memory._move.stuckCount++;
            // If creep is still stuck after two ticks find new path
            if (stuckCount >= MAX_STUCK_COUNT) {
                return creep.moveTo(destination, { reusePath: 3, maxOps: 5, visualizePathStyle: { stroke: '#ff0000' } });
            }
        } else {
            creep.memory._move.stuckCount = 0; // Reset stuckCount
        }

        // Default
        return creep.moveTo(destination, opts);
    }

    /**
     * Move closer to the target, but tries to avoid the road
     *
     * @param creep
     * @param destination
     * @param opts
     */
    private static addAvoidRoadCostMatrix(opts: TravelToOpts): void {
        if (!opts.costCallback) {
            opts.costCallback = function (roomName, costMatrix) {
                Pathing.getRoadStructures(roomName).forEach((road) => costMatrix.set(road.x, road.y, MATRIX_COST_OFF_ROAD));
            };
        }
    }

    /**
     * Check if the creep hasn't moved from his last coordinates
     * Fatigue will not count towards being stuck
     *
     * @param creep
     * @param travelData
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
     * @param pos1
     * @param pos2
     * @returns
     */
    private static sameCoord(pos1: Coord, pos2: Coord): boolean {
        return pos1.x === pos2.x && pos1.y === pos2.y;
    }

    /**
     * Store all road coordinates in room memory to save cpu time
     * TODO: Manually adding roads cant trigger this logik (maybe save tick time as well and periodically update this ==> say every 100 ticks or so)
     *
     * @param room
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
}
