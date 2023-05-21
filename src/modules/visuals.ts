import { decodeRoad, getRoadSegments } from './roads';
import { drawLayout } from './roomDesign';

export function runVisuals() {
    visualizeRoomData();
    if (Memory.debug?.drawRoads) {
        drawRoadsFromRoomData();
    }

    if (Memory.debug?.drawRemoteConnections) {
        drawLinesToRemoteRooms();
    }

    if (Memory.debug?.drawStamps) {
        drawRoomVisuals();
    }
}

function drawRoadsFromRoomData() {
    Object.keys(Memory.roomData).forEach((room) => {
        let rv = new RoomVisual(room);
        let roads = Memory.roomData[room]?.roads ? Object.values(Memory.roomData[room].roads) : [];
        if (roads?.length) {
            let roadSegments = [];
            roads.forEach((roadCode) => {
                let road = decodeRoad(roadCode, room);
                getRoadSegments(road).forEach((segment) => roadSegments.push(segment));
            });
            roadSegments.forEach((roadSegment) => {
                rv.poly(roadSegment, { lineStyle: 'dotted', stroke: '#63FF00', opacity: 100 });
                Game.map.visual.poly(roadSegment, { lineStyle: 'dotted', stroke: '#63FF00', opacity: 100 });
            });
        }
    });
}

function visualizeRoomData() {
    Object.entries(Memory.roomData).forEach(([roomName, data]) => {
        if (data.hostile) {
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, { fill: '#8b0000', stroke: '#8b0000', strokeWidth: 2, opacity: 0.25 });
        } else if (data.asOf) {
            Game.map.visual.rect(new RoomPosition(0, 0, roomName), 50, 50, { opacity: 0.15, stroke: '#00ffff', strokeWidth: 2 });
        }
    });
}

function drawLinesToRemoteRooms() {
    Object.keys(Game.rooms)
        .filter((room) => Game.rooms[room]?.controller?.my)
        .forEach((room) => {
            Game.rooms[room].remoteMiningRooms.forEach((remoteRoom) => {
                Game.map.visual.line(new RoomPosition(25, 25, room), new RoomPosition(25, 25, remoteRoom), { color: '3333ff', opacity: 100 });
            });
        });
}

function drawRoomVisuals() {
    Object.keys(Memory.rooms)
        .filter((room) => Memory.rooms[room].stampLayout)
        .forEach((stampRoom) => {
            let rv = Game.rooms[stampRoom]?.visual;
            if (rv) {
                drawLayout(rv, Game.rooms[stampRoom].memory.stampLayout);
            }
        });
}
