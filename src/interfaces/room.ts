interface RoomMemory {
    towerAttacked?: number;
    needsWallRepair?: boolean;
    upgraderLinkPos?: string;
    managerLink?: Id<Structure>;
    energyDistance?: number;
    controllerDistance?: number;
    unclaim?: boolean;
    managerPos?: string;
    gates?: Gate[];
    repairSearchCooldown?: number;
    repairQueue?: Id<Structure<StructureConstant>>[];
    miningAssignments?: { [posString: string]: string };
    mineralMiningAssignments?: { [posString: string]: string };
    labTasks?: { [id: number]: LabTask };
    finishedConstructionAtRcl?: number;
    shipments?: number[]; //stores IDs for shipments to be referenced from Memory.shipments
    factoryTask?: FactoryTask;
    scanProgress?: string;
    towerRepairMap?: { [towerId: string]: Id<StructureRoad> }; //maps towerId to roadId
    stampLayout?: Stamps;
    visionRequests?: string[]; //vision request Ids
    outstandingClaim?: string; //source to be claimed
    remoteSources?: { [sourcePos: string]: RemoteSourceData };
    lastRemoteSourceCheck?: number;
    threatLevel?: HomeRoomThreatLevel;
    resourceRequests?: string[];
    abandon?: boolean;
    /**
     * Tracks the amount of resources the manager is moving between storage structures. Used to include manager inventory in need calculation
     */
    transferBuffer?: { [resource: string]: { amount: number; creepName: string } };
    colonizationInProgress?: boolean;
    roomType: RoomType;
    lastScout?: number;
    /**
     * Id of the operation controlling this room
     */
    controllingOperation?: string;
}

/**
 * Operating mode for owned room:
 * - HOMEROOM is traditional room operations
 * - REMOTE_MINING is temporary ownership for running room-owner level functions over remote mined rooms
 * - OPERATION_CONTROLLED is for rooms owned for operation purposes
 */
const enum RoomType {
    HOMEROOM = 1,
    REMOTE_MINING,
    OPERATION_CONTROLLED,
}

interface RemoteSourceData {
    miner: string;
    gatherers: string[];
    miningPos: string;
    setupStatus?: RemoteSourceSetupStatus; //delete when done to save memory
}

const enum RemoteSourceSetupStatus {
    BUILDING_CONTAINER = 1,
    BUILDING_ROAD,
}

interface RemoteData {
    reservationState?: RemoteRoomReservationStatus;
    reserver?: string;
    mineralMiner?: string;
    mineralAvailableAt?: number;
    threatLevel: RemoteRoomThreatLevel;
    keeperExterminator?: string;
    sourceKeeperLairs?: { [sourcePos: string]: { id: Id<Structure<StructureConstant>>; pos: string } }; // keeperId: closestSourceId
    shouldCheckStructures?: boolean;
    clearStructures?: boolean;
    evacuate?: boolean;
    threatReset?: number;
}

interface RoomData {
    asOf: number;
    sources?: string[];
    mineralTypes?: MineralConstant[];
    roomStatus?: RoomMemoryStatus;
    owner?: string;
    hostile?: boolean;
    threatDetected?: boolean; // Will only be set for rooms adjacent to owned_me rooms
    roomLevel?: number;
    powerBank?: boolean;
    deposits?: DepositConstant[];
    roads?: { [roadKey: string]: string }; // [startPos:endPos]: roadCode[]
    thoriumAmount?: number;
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
    myCreepsByMemory: Creep[];
    myCreeps: Creep[];
    myPowerCreeps: PowerCreep[];
    hostileCreeps: Creep[];
    energyStatus: EnergyStatus;
    minerals: Mineral[];
    managerLink: StructureLink;
    upgraderLink: StructureLink;
    getRepairTarget(): Id<Structure>;
    canSpawn(): boolean;
    /**
     * The number of work parts a room can sustain
     */
    baseWorkCapacity: number;
    /**
     * The number of work parts a room can sustain, modified by economic factors (energy in storage)
     */
    modifiedWorkCapacity: number;
    spawns: StructureSpawn[];
    mySpawns: StructureSpawn[];
    labs: StructureLab[];
    getDefenseHitpointTarget(): number;
    addLabTask(opts: LabTaskPartial): ScreepsReturnCode;
    getNextNukeProtectionTask(): Id<Structure> | Id<ConstructionSite>;
    addFactoryTask(product: ResourceConstant, amount: number): ScreepsReturnCode;
    factory: StructureFactory;
    observer: StructureObserver;
    powerSpawn: StructurePowerSpawn;
    remoteMiningRooms: string[];
    remoteSources: string[];
    myStructures: AnyOwnedStructure[];
    hostileStructures: AnyOwnedStructure[];
    structures: AnyStructure[];
    myConstructionSites: ConstructionSite[];
    reservedEnergy: number;
    addSpawnAssignment(creepBody: BodyPartConstant[], opts: SpawnOptions, name?: string): ScreepsReturnCode;
    /**
     * The amount of work being spawned this tick. Used for work capacity calculations
     */
    workSpawning: number;

    // Caching - Only used in roomPrototypes
    _myCreepsByMemory: Creep[];
    _myCreeps: Creep[];
    _myPowerCreeps: PowerCreep[];
    _hostileCreeps: Creep[];
    _minerals: Mineral[];
    _managerLink: StructureLink;
    _upgraderLink: StructureLink;
    _remoteMiningRooms: string[];
    _remoteSources: string[];
    _powerSpawn: StructurePowerSpawn;
    _observer: StructureObserver;
    _factory: StructureFactory;
    _labs: StructureLab[];
    _spawns: StructureSpawn[];
    _mySpawns: StructureSpawn[];
    _baseWorkCapacity: number;
    _modifiedWorkCapacity: number;
    _myStructures: AnyOwnedStructure[];
    _hostileStructures: AnyOwnedStructure[];
    _structures: Structure[];
    _myConstructionSites: ConstructionSite[];

    /**
     * Returns a map of each provided boost type to the number of boosts available
     * @param boostTypes array of types to calculate
     */
    getBoostsAvailable(boostTypes: BoostType[]): { [type: number]: number };

    /**
     * Returns the amount of supplied resource in rooms storage or terminal
     * @param resource the resource to query
     */
    getResourceAmount(resource: ResourceConstant): number;

    /**
     * returns the amount of resource that exists in its compressed form in a room's storage & terminal
     * @param resource
     */
    getCompressedResourceAmount(resource: ResourceConstant): number;

    /**
     * Returns the amount of resource that is designated to come in through shipments
     * @param resource
     */
    getIncomingResourceAmount(resource: ResourceConstant): number;

    /**
     * Returns the amount of resource that is obligated to outbound shipments
     * @param resource
     */
    getOutgoingResourceAmount(resource: ResourceConstant): number;

    /**
     * Creates a Shipment in Memory.shipments from this room to another target room
     * @param destination the target room
     * @param resource the resource to send
     * @param amount the amount of resource to send
     */
    addShipment(destination: string, resource: ResourceConstant, amount: number): ScreepsReturnCode;

    /**
     * Creates a request in Memory.resourceRequests for this room
     * @param resource the resource to request
     * @param amount the amount of resource to request
     */
    addRequest(resource: ResourceConstant, amount: number): number; //returns id

    /**
     * Creates a specialized shipment in Memory.shipments used to complete a market purchase
     * @param marketId the id of the market listing to purchase
     * @param amount the amount of resource to purchase
     */
    addMarketOrder(marketId: string, amount: number);
}

interface RoomPosition {
    findClosestCreepByRange: (this: RoomPosition, forHostile: boolean) => void;
    findFirstInRange<T extends _HasRoomPosition | RoomPosition>(this: RoomPosition, positions: T[], range: number): T;
    toMemSafe(): string;
    neighbors(includeDiagonal?: boolean, includeCenter?: boolean): RoomPosition[];
}

interface Stamps {
    extension: StampDetail[];
    tower: StampDetail[];
    road: StampDetail[];
    rampart: StampDetail[];
    lab: StampDetail[];
    link: StampDetail[];
    observer: StampDetail[];
    powerSpawn: StampDetail[];
    spawn: StampDetail[];
    managers: StampDetail[];
    storage: StampDetail[];
    nuker: StampDetail[];
    terminal: StampDetail[];
    factory: StampDetail[];
    container: StampDetail[];
    extractor: StampDetail[];
}

interface StampDetail {
    type?: string; // Can differentiate if needed (center vs miner extensions)
    rcl: number; // Indicator at what rcl structure should be build
    pos: string;
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

/**
 * The enums on the top overwrite the lower ones (for example if an attack unit is in the room and a structure it will set ENEMY_ATTACK_CREEPS)
 */
const enum HomeRoomThreatLevel {
    SAFE = 0,
    /**
     * Enemy Creeps with no threat (scouts, collectors)
     */
    ENEMY_NON_COMBAT_CREEPS,
    /**
     * Invaders (npcs)
     */
    ENEMY_INVADERS,
    /**
     * Enemy Creeps with no attack but work parts
     */
    ENEMY_DISMANTLERS,
    /**
     * Enemy Creeps with attack body parts
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

interface RemoteStats {
    estimatedIncome: number;
    sourceSize: number;
    road: RoomPosition[];
    roadLength: number;
    roadMaintenance: number;
    containerMaintenance: number;
    minerUpkeep: number;
    gathererCount: number;
    gathererUpkeep: number;
    reserverUpkeep: number;
    exterminatorUpkeep: number;
    miningPos: RoomPosition;
}
