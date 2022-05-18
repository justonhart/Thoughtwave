interface RoomMemory {
    unclaim: boolean;
    managerPos: string;
    anchorPoint: string;
    gates: Gate[];
    repairSearchCooldown: number;
    repairQueue: Id<Structure<StructureConstant>>[];
    miningAssignments: Map<string, AssignmentStatus>;
    remoteAssignments: { [roomName: string]: RemoteAssignment };
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
    spawnAssignments: Role[];
    reservedEnergy?: number;
    layout: RoomLayout;
}

interface RemoteAssignment {
    needsConstruction: boolean;
    energyStatus: EnergyStatus;
    state: RemoteMiningRoomState;
    controllerState: RemoteMiningRoomControllerState;
    reserver: AssignmentStatus;
    gatherer: AssignmentStatus;
    miners: Map<string, AssignmentStatus>;
}

interface Room {
    removeFromRepairQueue(id: string): void;
    energyStatus: EnergyStatus;
    mineral: Mineral;
    managerLink: StructureLink;
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

interface Gate {
    id: Id<StructureRampart>;
    lastToggled: number;
}

const enum RoomLayout {
    BUNKER,
}
