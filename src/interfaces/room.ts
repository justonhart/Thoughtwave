interface RoomMemory {
    containerPositions?: string[];
    phaseShift?: PhaseShiftStatus;
    phase?: number;
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
}

interface Room {}

interface RoomPosition {
    toMemSafe(): string;
}

const enum PhaseShiftStatus {
    PREPARE = 'Preparing',
    EXECUTE = 'Execute',
}
