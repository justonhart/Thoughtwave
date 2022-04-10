interface TravelToOpts extends MoveToOpts {
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
}

/**
 * This is the default memory implemented by screeps
 */
interface MoveMemory {
    dest?: Destination;
    path?: string;
    room?: string;
}

/**
 * Custom movement information for the travel function
 */
interface TravelData {
    prevPos?: RoomPosition;
    stuckCount?: number;
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
