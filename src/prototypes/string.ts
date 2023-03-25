interface String {
    toRoomPos(): RoomPosition
}

String.prototype.toRoomPos = function(this: string) {

    if(!this) return undefined;

    try{
        let split = this.split('.');
        return new RoomPosition(parseInt(split[0]), parseInt(split[1]), split[2]);
    } catch (e) {
        console.log(`error parsing room position from string: ${this}`);
        return undefined;
    }
}