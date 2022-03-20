export default function driveRoom(room: Room){
    if(room.memory?.sourceAccessPointCount == undefined){
        room.initRoomMemory();
    }
}

function runTowers(room: Room){

}