interface RoomMemory {
    unclaim?: boolean;
    managerPos?: string;
    anchorPoint?: string;
    gates?: Gate[];
    repairSearchCooldown?: number;
    repairQueue?: Id<Structure<StructureConstant>>[];
    miningAssignments?: Map<string, AssignmentStatus>;
    remoteAssignments?: { [roomName: string]: RemoteAssignment };
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints?: string[];
    sourceAccessPointCount?: number;
    roadsConstructed?: boolean;
    spawnAssignments?: Role[];
    reservedEnergy?: number;
    layout?: RoomLayout;
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
    PREPARE = 1,
}

const enum AssignmentStatus {
    UNASSIGNED = 'unassigned',
    ASSIGNED = 'assigned',
}

/**
 * The enums on the top overwrite the lower ones (for example if an attack unit is in the room and a structure it will set ENEMY_ATTACK_CREEPS)
 */
const enum RemoteMiningRoomState {
    /**
     * Enemy Creeps with attack body parts.
     */
    ENEMY_ATTTACK_CREEPS,
    /**
     * Enemy Creeps with other body parts.
     */
    ENEMY_NON_COMBAT_CREEPS,
    /**
     * Enemy structures (includes invader cores).
     */
    ENEMY_STRUCTS,
    SAFE,
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
    /**
     * Currently controlled by enemy.
     */
    ENEMY,
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
