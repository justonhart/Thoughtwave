interface TravelToOpts extends PathFinderOpts {
    /**
     * Avoid roads. This is only used, when no other "costCallback" matrix has been provided.
     */
    avoidRoads?: boolean;
    /**
     * Avoid road on the last move towards the Target.
     */
    avoidRoadOnLastMove?: boolean;
    /**
     * Default it is set to false to minimize cpu cost as most creeps are traveling inside the base.
     */
    avoidHostiles?: boolean;
    /**
     * Treating structures as walkable tiles. Could be useful in attacking scenario (like our trap)
     */
    ignoreStructures?: boolean;
    /**
     * Ignore any creeps when finding a path.
     */
    ignoreCreeps?: boolean;
    /**
     * Avoid any rooms that have been marked as hostile.
     */
    avoidHostileRooms?: boolean;
    /**
     * Do not use Matrix cache.
     */
    freshMatrix?: boolean;
    /**
     * Range away from destination
     */
    range?: number;
    /**
     * How often the path should be reused. By default it isn't needed but for attack/defense units this should be set to 0 to recalculate path every tick.
     */
    reusePath?: number;
    /**
     * Change color of the serialized Path. Default is orange.
     */
    pathColor?: string;
}

/**
 * Custom movement information for the travel function
 */
interface TravelState {
    lastCoord?: string;
    destination?: string;
    path?: string;
}

interface Destination {
    x: number;
    y: number;
    room: string;
}

declare const IN_ROOM: IN_ROOM;
type IN_ROOM = -20;
type HasPos = { pos: RoomPosition };
type Coord = { x: number; y: number };
