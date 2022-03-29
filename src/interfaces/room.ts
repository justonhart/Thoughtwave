interface RoomMemory {
    collectSearchCooldown: number;
    collectQueue: (Id<Structure> | Id<Resource> | Id<Tombstone> | Id<Ruin>)[];
    repairSearchCooldown: number;
    repairQueue: Id<Structure<StructureConstant>>[];
    miningAssignments: Map<string, AssignmentStatus>;
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
    spawnAssignments: Role[];
}

interface Room {
    getRepairTarget(): Id<Structure>;
    getCollectionTarget(): Id<Structure> | Id<Resource> | Id<Tombstone> | Id<Ruin>;
}

interface RoomPosition {
    toMemSafe(): string;
}

const enum PhaseShiftStatus {
    PREPARE = 'Preparing',
    EXECUTE = 'Execute',
}

const enum AssignmentStatus {
    UNASSIGNED = 'unassigned',
    ASSIGNED = 'assigned',
}
