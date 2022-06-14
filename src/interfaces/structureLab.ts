interface StructureLab {
    taskIndex: number;
    status: LabStatus;
    inNeed: boolean;
}

interface LabTask {
    primaryLab: Id<StructureLab>;
    auxillaryLabs?: Id<StructureLab>[];
    type: LabTaskType;
    status: TaskStatus;
    labNeeds?: LabNeed[];
    cyclesCompleted?: number;
    targetCreep?: Id<Creep>;
}

interface LabTaskOpts {
    type: LabTaskType;
    reagentsNeeded: LabNeed[];
    targetCreep?: Id<Creep>;
}

interface LabNeed {
    resource: ResourceConstant;
    amount: number;
    lab?: Id<StructureLab>;
    fulfilled?: boolean;
}

const enum LabTaskType {
    REACT = 1,
    REVERSE,
    BOOST,
    UNBOOST,
}

const enum TaskStatus {
    QUEUED = 1,
    PREPARING,
    WAITING,
    ACTIVE,
    CLEANUP,
    COMPLETE,
}

const enum LabStatus {
    AVAILABLE = 0,
    IN_USE_PRIMARY,
    IN_USE_AUXILLARY,
}
