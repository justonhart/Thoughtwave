interface RoomMemory {
    hqPos: string;
    gates: Gate[];
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
    remoteMining: Map<string, string[]>; // Map<room, sourceIds>
    reservedEnergy?: number;
    layout: RoomLayout;
}

interface Room {
    energyStatus: EnergyStatus;
    getRepairTarget(): Id<Structure>;
    canSpawn(): boolean;
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

interface Gate {
    id: Id<StructureRampart>;
    lastToggled: number;
}

const enum RoomLayout {
    SQUARE,
}
