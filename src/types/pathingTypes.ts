interface TravelToOpts extends MoveToOpts {
    /**
     * Avoid roads. This is only used, when no other "costCallback" matrix has been provided.
     */
    avoidRoads: boolean;
}

interface TravelData {
    dest?: Destination;
    time?: number;
    path?: string;
    room?: string;
}

interface Destination {
    x: number;
    y: number;
    room: string;
}

type HasPos = { pos: RoomPosition };
type Coord = { x: number; y: number };
