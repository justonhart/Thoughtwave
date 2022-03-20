interface CreepMemory {
    targetId?: Id<Structure> | Id<ConstructionSite>;
    miningPos?: string;
    gathering?: boolean;
    room?: string;
    role?: Role;
    _move?: TravelData;
}

interface Creep {
    travelTo(destination: HasPos | RoomPosition, opts?: TravelToOpts): CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET | ERR_NOT_FOUND;
}

const enum Role {
    WORKER = 'Worker',
    BUILDER = 'Builder',
    UPGRADER = 'Upgrader',
    MAINTAINTER = 'MAINTAINTER',
}
