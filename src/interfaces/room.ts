interface RoomMemory {
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
    energyStatus: EnergyStatus;
    getRepairTarget(): Id<Structure>;
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

const enum EnergyStatus {
    CRITICAL,
    RECOVERING,
    STABLE,
    SURPLUS,
}
