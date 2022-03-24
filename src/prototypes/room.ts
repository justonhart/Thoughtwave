RoomPosition.prototype.toMemSafe = function (this: RoomPosition): string {
    return `${this.x}.${this.y}.${this.roomName}`;
};
