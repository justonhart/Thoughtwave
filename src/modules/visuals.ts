export function runVisuals() {
    highlightHostileRooms();
    drawRoadsFromRoomData();
    drawLinesToRemoteRooms();
}

function drawRoadsFromRoomData() {
    Object.keys(Memory.roomData).forEach((room) => {
        let rv = new RoomVisual(room);
        let roads = Memory.roomData[room]?.roads ? Object.values(Memory.roomData[room].roads) : [];
        if (roads?.length) {
            let rvRoads = [];
            roads.forEach((road) => {
                let arr = [];
                road.split(',').forEach((posString) => {
                    let split = posString.split(':').map((v) => parseInt(v));

                    let pos;
                    try {
                        pos = new RoomPosition(split[0], split[1], room);
                        arr.push(pos);
                    } catch (e) {}
                });
                rvRoads.push(arr);
            });
            rvRoads.forEach((road) => rv.poly(road, { lineStyle: 'dotted' }));
        }
    });
}

function highlightHostileRooms() {
    Object.keys(Memory.roomData)
        .filter((roomName) => Memory.roomData[roomName].hostile)
        .forEach((roomName) => {
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, { fill: '#8b0000', stroke: '#8b0000', strokeWidth: 2 });
        });
}

function drawLinesToRemoteRooms() {
    Object.keys(Game.rooms)
        .filter((room) => Game.rooms[room]?.controller?.my)
        .forEach((room) => {
            Memory.rooms[room].remoteMiningRooms.forEach((remoteRoom) => {
                Game.map.visual.line(new RoomPosition(25, 25, room), new RoomPosition(25, 25, remoteRoom), { color: '3333ff', opacity: 100 });
            });
        });
}
