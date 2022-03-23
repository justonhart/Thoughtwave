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
     * Set task priority.
     */
    priority?: Priority;
}

interface TravelData {
    dest?: Destination;
    time?: number;
    path?: string;
    room?: string;
    prevCoords?: Coord;
    stuckCount?: number;
}

interface Destination {
    x: number;
    y: number;
    room: string;
}

type HasPos = { pos: RoomPosition };
type Coord = { x: number; y: number };
