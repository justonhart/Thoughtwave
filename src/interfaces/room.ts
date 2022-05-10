interface RoomMemory {
    gates: Gate[];
    traps: CreepTrap[];
    repairSearchCooldown: number;
    repairQueue: Id<Structure<StructureConstant>>[];
    miningAssignments: Map<string, AssignmentStatus>;
    remoteAssignments: Map<string, RemoteAssignment>;
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
    spawnAssignments: Role[];
    reservedEnergy?: number;
}

interface RemoteAssignment {
    needsConstruction: boolean;
    state: RemoteMiningRoomState;
    controllerState: RemoteMiningRoomControllerState;
    reserver: AssignmentStatus;
    gatherer: AssignmentStatus;
    surplusGatherer: boolean;
    miners: Map<string, AssignmentStatus>;
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

const enum RemoteMiningRoomState {
    SAFE,
    /**
     * Enemy attack creep in room.
     */
    ENEMY,
    /**
     * Enemy claimer (player/invader core) in room.
     */
    ENEMY_CLAIMER,
}

const enum RemoteMiningRoomControllerState {
    /**
     * Controller reserve above 4500.
     */
    STABLE,
    /**
     * Controller reserve under 1000.
     */
    LOW,
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
