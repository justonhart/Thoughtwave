interface Operation {
    originRoom: string;
    stage: OperationStage;
    type: OperationType;
    expireAt?: number;
    waypoints?: string[];
    visionRequests?: string[];
    subOperations?: string[];
    parentId?: string;
    targetRoom?: string;
}

interface OperationOpts {
    originRoom?: string;
    operativeCount?: number;
    originOpts?: OriginOpts;
    targetPos?: string;
    resource?: ResourceConstant;
    expireAt?: number;
    waypoints?: string[];
    forcedDestinations?: string[];
    pathCost?: number;
    disableLogging?: boolean;
    parentId?: string;
}

interface OriginOpts {
    maxThreatLevel?: HomeRoomThreatLevel;
    minEnergyStatus?: EnergyStatus;
    maxLinearDistance?: number;
    minSpawnCount?: number;
    needsBoost?: boolean;
    selectionCriteria?: OriginCriteria;
    operationCriteria?: OperationCriteria;
    ignoreTerrain?: boolean;
    ignoreRoomData?: boolean; // TODO: implement this to set highways to 1?
}

interface OperationCriteria {
    type: OperationType;
    maxCount: number;
    stage?: OperationStage;
}

interface OriginResult {
    roomName: string;
    cost: number;
}

const enum OriginCriteria {
    HIGHEST_LEVEL,
    CLOSEST,
}

const enum OperationType {
    COLONIZE = 1,
    STERILIZE,
    COLLECTION,
    SECURE,
    ROOM_RECOVERY,
    ATTACK,
    QUAD_ATTACK,
    UPGRADE_BOOST,
    REMOTE_BUILD,
    CLEAN,
    ADD_REMOTE_MINING,
    POWER_BANK,
    TRANSFER,
}

const enum OperationStage {
    FAILED = -1,
    SUSPEND,
    PREPARE = 1,
    ACTIVE,
    CLAIM,
    BUILD,
    COMPLETE,
}

/**
 * Simple operation type that targets a room for certain tasks
 */
interface SimpleOperation extends Operation {
    operativeCount: number;
}

/**
 * Operation to colonize a new room
 */
interface ColonizeOperation extends Operation {
    /**
     * Whether or not there is some substantial source of energy available in the targeted room. If so, a transfer operation won't be created
     */
    roomContainsStarterEnergy?: boolean;
    /**
     * The room path from the origin to the target room
     */
    pathRooms: string[];
    /**
     * If the route is confirmed as safe, this is set
     */
    routeConfirmed: boolean;
}

interface SecureOperation extends Operation {
    pathCost: number;
    protectorCount: number;
}

interface RoomRecoveryOperation extends Operation {
    workerCount: number;
}

interface PowerBankOperation extends Operation {
    pathCost: number;
    operativeCount: number;
}

interface ResourceOperation extends Operation {
    resource?: ResourceConstant;
    amount?: number;
}
