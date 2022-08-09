interface RoomMemory {
    needsWallRepair?: boolean;
    upgraderLinkPos?: string;
    managerLink?: Id<Structure>;
    labRequests?: LabNeed[];
    energyDistance?: number;
    controllerDistance?: number;
    unclaim?: boolean;
    managerPos?: string;
    anchorPoint?: string;
    gates: Gate[];
    repairSearchCooldown: number;
    repairQueue: Id<Structure<StructureConstant>>[];
    miningAssignments: { [posString: string]: string };
    mineralMiningAssignments: { [posString: string]: string };
    remoteMiningRooms?: string[];
    reservedEnergy?: number;
    layout?: RoomLayout;
    labTasks?: LabTask[];
    dontCheckConstructionsBefore?: number;
    shipments?: Shipment[];
    factoryTask?: FactoryTask;
}

interface RemoteData {
    reservationState?: RemoteRoomReservationStatus;
    miningPositions: { [id: Id<Source>]: string }; // sourceId: miningPos
    miner: string;
    gatherer: string;
    gathererSK?: string;
    reserver?: string;
    threatLevel: RemoteRoomThreatLevel;
    keeperExterminator?: string;
    sourceKeeperLairs?: { [id: Id<Source>]: Id<Structure<StructureConstant>> }; // keeperId: closestSourceId
}

interface RoomData {
    asOf: number;
    sourceCount?: number;
    mineralType?: MineralConstant;
    roomStatus?: RoomMemoryStatus;
    owner?: string;
    hostile?: boolean;
    roomLevel?: number;
}

const enum RoomMemoryStatus {
    VACANT = 1,
    RESERVED_OTHER,
    RESERVED_INVADER,
    RESERVED_ME,
    OWNED_OTHER,
    OWNED_INVADER,
    OWNED_ME,
}

interface Room {
    removeFromRepairQueue(id: string): void;
    creeps: Creep[];
    energyStatus: EnergyStatus;
    mineral: Mineral;
    managerLink: StructureLink;
    upgraderLink: StructureLink;
    getRepairTarget(): Id<Structure>;
    canSpawn(): boolean;
    workerCapacity: number;
    labs: StructureLab[];
    getDefenseHitpointTarget(): number;
    addLabTask(opts: LabTaskOpts): ScreepsReturnCode;
    getBoostResourcesAvailable(boostTypes: BoostType[]): { [type: number]: { resource: string; amount: number }[] };
    getNextNukeProtectionTask(): Id<Structure> | Id<ConstructionSite>;
    addShipment(destination: string, resource: ResourceConstant, amount: number, marketOrderId?: string): ScreepsReturnCode;
    addFactoryTask(product: ResourceConstant, amount: number): ScreepsReturnCode;
    factory: StructureFactory;
}

interface RoomPosition {
    toMemSafe(): string;
}

const enum PhaseShiftStatus {
    PREPARE = 1,
}

const enum AssignmentStatus {
    UNASSIGNED = '',
    ASSIGNED = 'ASSIGNED',
}

/**
 * The enums on the top overwrite the lower ones (for example if an attack unit is in the room and a structure it will set ENEMY_ATTACK_CREEPS)
 */
const enum RemoteRoomThreatLevel {
    SAFE = 0,
    INVADER_CORE,
    /**
     * Enemy Creeps with other body parts.
     */
    ENEMY_NON_COMBAT_CREEPS,
    /**
     * Enemy Creeps with attack body parts.
     */
    ENEMY_ATTTACK_CREEPS,
}

const enum RemoteRoomReservationStatus {
    /**
     * Controller reserve under 1000.
     */
    LOW,
    /**
     * Controller reserve above 4500.
     */
    STABLE,
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
    OVERFLOW,
}

interface Gate {
    id: Id<StructureRampart>;
    lastToggled: number;
}

const enum RoomLayout {
    BUNKER,
}
