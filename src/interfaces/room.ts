interface RoomMemory {
    availableSourceAccessPoints: string[];
    sourceAccessPointCount: number;
    roadsConstructed?: boolean;
}

interface Room {
    initRoomMemory(): void;
}

interface RoomPosition {
    toMemSafe(): string;
}
