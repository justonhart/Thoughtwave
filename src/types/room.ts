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

Room.prototype.initRoomMemory = function (this: Room) {
    this.memory.availableSourceAccessPoints = [];

    let sources = this.find(FIND_SOURCES);

    for (let source of sources) {
        let accessPoints = this.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true)
            .filter((terrain) => terrain.terrain != 'wall')
            .map((terrain) => new RoomPosition(terrain.x, terrain.y, this.name));
        accessPoints.forEach((pos) => {
            if (this.memory.availableSourceAccessPoints.indexOf(pos.toMemSafe()) === -1)
                this.memory.availableSourceAccessPoints.push(pos.toMemSafe());
        });
    }

    Game.rooms[this.name].memory.sourceAccessPointCount = Game.rooms[this.name].memory.availableSourceAccessPoints.length;
};

RoomPosition.prototype.toMemSafe = function (this: RoomPosition): string {
    return `${this.x}.${this.y}.${this.roomName}`;
};
