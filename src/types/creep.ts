interface CreepMemory {
  room?: string;
  role: Role;
  _move?: TravelData;
  prevCoords?: Coord;
  stuckCount?: number;
}

interface Creep {
  travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
}

const enum Role {
  HARVESTER = 'Harvester',
  BUILDER = 'Builder',
}
