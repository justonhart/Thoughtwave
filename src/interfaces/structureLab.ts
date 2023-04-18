interface StructureLab {
    taskId: number;
    status: LabStatus;
}

interface LabTask extends LabTaskPartial {
    reactionLabs?: Id<StructureLab>[];
    auxillaryLabs?: Id<StructureLab>[];
    status: TaskStatus;
}

interface LabTaskPartial {
    type: LabTaskType;
    needs: LabNeed[];
    targetCreepName?: string;
}

interface LabNeed {
    resource: ResourceConstant;
    amount: number;
    lab?: Id<StructureLab>;
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
    ACTIVE,
    COMPLETE,
}

const enum LabStatus {
    AVAILABLE = 0,
    IN_USE_PRIMARY,
    IN_USE_AUXILLARY,
    NEEDS_EMPTYING,
}
