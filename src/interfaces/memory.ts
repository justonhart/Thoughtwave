interface Memory {
    username: string;
    remoteData: { [roomName: string]: RemoteData };
    roomData: { [roomName: string]: RoomData };
    priceMap?: { [resourceType: string]: number };
    logCPU?: boolean;
    spawnAssignments?: SpawnAssignment[];
    operations?: { [operationId: string]: Operation };
    playersToIgnore?: string[];
    squads?: { [squadId: string]: Squad };
    marketBlacklist?: string[]; //player names we don't want to sell to
    blacklistedRooms?: string[]; //room names we don't sell to
    visionRequests?: { [id: string]: VisionRequest };
    remoteSourceClaims?: { [sourcePos: string]: { claimant: string; estimatedIncome: number } }; //map of potential remote rooms to rooms intending to claim them and their anticipated net income - higher income gets priority
    remoteSourceAssignments?: { [sourcePos: string]: RemoteAssignmentData }; //maps sources in other rooms to owned rooms mining them
    debug?: DebugSettings;
    cpuUsage: CpuUsage;
    shipments: { [id: string]: Shipment };
    resourceRequests: { [id: string]: ResourceRequest };
}

interface CpuUsage {
    average: number;
    totalOverTime: number;
}

interface EmpireIntershard {
    outboundCreeps: OutboundCreeps;
}

interface OutboundCreeps {
    shard0: Map<string, OutboundCreepEntry>;
    shard1: Map<string, OutboundCreepEntry>;
    shard2: Map<string, OutboundCreepEntry>;
    shard3: Map<string, OutboundCreepEntry>;
}

interface OutboundCreepEntry {
    memory: CreepMemory;
    expirationTime: number;
}

interface SpawnAssignment {
    designee: string; //room name
    spawnOpts: SpawnOptions;
    body: BodyPartConstant[];
    name?: string;
}

interface HostileRoom {
    room: string;
    expireAt: number; // Game Tick at which the room is no longer considered hostile
}

interface Squad {
    squadType: SquadType;
    members?: SquadMembers;
    forcedDestinations?: string[];
    assignment: string; // RoomName
    nextDirection?: DirectionConstant;
    isFleeing?: boolean;
    orientation?: TOP | RIGHT | BOTTOM | LEFT;
    anchor?: RIGHT | LEFT; // squadLeaders relative position (clockwise)
    lastRun?: number; // Game tick when squad logic was last executed (enables certain logic to only run once per squad)
    targetStructure?: Id<Structure>;
}

interface SquadMembers {
    squadLeader?: Id<Creep>;
    squadFollower?: Id<Creep>;
    squadSecondLeader?: Id<Creep>;
    squadSecondFollower?: Id<Creep>;
}

interface Shipment {
    sender: string;
    recipient: string;
    resource: ResourceConstant;
    amount: number;
    status?: ShipmentStatus;
    marketOrderId?: string;
    requestId?: string;
}

const enum ShipmentStatus {
    FAILED = -1,
    QUEUED,
    PREPARING,
    READY,
    SHIPPED,
}

interface FactoryTask {
    product: ResourceConstant;
    amount: number;
    needs?: FactoryNeed[];
    started?: boolean;
}

interface FactoryNeed {
    resource: ResourceConstant;
    amount: number;
}

const enum SquadType {
    DUO,
    QUAD,
}

interface VisionRequest {
    targetRoom: string; //roomname
    assigned?: boolean;
    onTick?: number; //what tick is the vision required? undefined = immediately
    completed?: boolean; //once need is done, mark completed to remove
}

interface DebugSettings {
    logOperations?: boolean;
    earlyNotify?: boolean;
    drawStamps?: boolean;
    logCpu?: boolean;
    drawRoads?: boolean;
    drawRemoteConnections?: boolean;
    drawRoomData?: boolean;
    logRoomPlacementCpu?: boolean;
    logRoomCpu?: boolean;
    logCreepCpu?: boolean;
    logShipments?: boolean;
    logFactoryTasks?: boolean;
}

interface RemoteAssignmentData {
    controllingRoom: string;
    estimatedIncome: number;
    roadLength: number;
}

interface EmpireResourceData {
    producers: { [mineral: string]: string[] }; //map of minerals to which rooms produce them
    inventory: { [resource: string]: number }; //total amount of each resource in empire storages and terminals
}

interface ResourceRequest extends ResourceRequestPartial {
    shipments: number[];
    status: ResourceRequestStatus;
}

interface ResourceRequestPartial {
    room: string;
    resource: ResourceConstant;
    amount: number;
}

const enum ResourceRequestStatus {
    FAILED = -1,
    SUBMITTED,
    ASSIGNED,
    FULFILLED,
}

interface EmpireData {
    roomsOwned: number;
    roomCap: number;
}
