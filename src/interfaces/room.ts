interface RoomMemory {
    gates: Gate[];
    traps: CreepTrap[];
    repairSearchCooldown: number;
    repairQueue: Id<Structure<StructureConstant>>[];
    miningAssignments: Map<string, AssignmentStatus>;
    distributorAssignments: Map<string, AssignmentStatus>; // TODO: make this remoteAssignments so it can store distributors + claimers (move miners in here?)
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
    spawnAssignments: Role[];
    reservedEnergy?: number;
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

interface CreepTrap {
    gates: Gate[];
}

interface Gate {
    id: Id<StructureRampart>;
    lastToggled: number;
}
