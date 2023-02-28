export function addRoomData(room: Room) {
    let data: RoomData = {
        sourceCount: room.find(FIND_SOURCES).length,
        mineralType: room.mineral?.mineralType,
        asOf: Game.time,
    };

    Memory.roomData[room.name] = data;

    updateRoomData(room);
}

export function posFromMem(memPos: string): RoomPosition {
    let split = memPos?.split('.');
    return split ? new RoomPosition(Number(split[0]), Number(split[1]), split[2]) : null;
}

export function updateRoomData(room: Room) {
    let data = Memory.roomData[room.name];

    let controllingInvaderCore: StructureInvaderCore = room
        .find(FIND_HOSTILE_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_INVADER_CORE && s.level })
        .shift() as StructureInvaderCore;
    if (controllingInvaderCore) {
        data.roomStatus = RoomMemoryStatus.OWNED_INVADER;
        data.roomLevel = controllingInvaderCore.level;
        delete data.owner;
    } else if (room.controller?.owner?.username) {
        data.owner = room.controller.owner.username;
        if (room.controller.my) {
            data.roomStatus = RoomMemoryStatus.OWNED_ME;
        } else {
            data.roomStatus = RoomMemoryStatus.OWNED_OTHER;
        }
        data.roomLevel = room.controller.level;
    } else if (room.controller?.reservation) {
        delete data.owner;
        delete data.roomLevel;
        if (room.controller.reservation.username === getUsername()) {
            data.roomStatus = RoomMemoryStatus.RESERVED_ME;
        } else if (room.controller.reservation.username === 'Invader') {
            data.roomStatus = RoomMemoryStatus.RESERVED_INVADER;
        } else {
            data.roomStatus = RoomMemoryStatus.RESERVED_OTHER;
        }
    } else {
        delete data.owner;
        delete data.roomLevel;
        data.roomStatus = RoomMemoryStatus.VACANT;
    }

    if (data.roomStatus !== RoomMemoryStatus.OWNED_ME && data.roomLevel) {
        data.hostile = true;
    } else {
        delete data.hostile;
    }

    data.asOf = Game.time;

    Memory.roomData[room.name] = data;
}

export function getUsername(): string {
    return (
        Object.values(Game.spawns)?.shift()?.owner.username ||
        Object.values(Game.creeps)?.shift()?.owner.username ||
        Object.values(Game.rooms).find((room) => room.controller?.my).controller.owner.username
    );
}

export function deleteExpiredRoomData() {
    Object.keys(Memory.roomData)
        .filter((roomName) => Memory.roomData[roomName].asOf + 20000 < Game.time || !Memory.roomData[roomName].asOf)
        .forEach((roomName) => {
            delete Memory.roomData[roomName].hostile;
            delete Memory.roomData[roomName].owner;
            delete Memory.roomData[roomName].roomStatus;
            delete Memory.roomData[roomName].roomLevel;
            delete Memory.roomData[roomName].asOf;
        });
}

export function deleteExpiredRoadData() {
    Object.keys(Memory.roomData)
        .filter((roomName) => Game.rooms[roomName] && Memory.roomData[roomName].roads)
        .forEach((roomName) =>
            Object.keys(Memory.roomData[roomName].roads)
                .filter((containerId) => !Game.getObjectById(containerId))
                .forEach((containerId) => delete Memory.roomData[roomName].roads[containerId])
        );
}

export function isKeeperRoom(roomName: string) {
    return (
        !isCenterRoom(roomName) &&
        roomName
            .replace(/[EW]/, '')
            .replace(/[NS]/, '.')
            .split('.')
            .map((num) => [4, 5, 6].includes(parseInt(num) % 10))
            .reduce((last, next) => last && next)
    );
}

export function isCenterRoom(roomName: string) {
    return roomName
        .replace(/[EW]/, '')
        .replace(/[NS]/, '.')
        .split('.')
        .map((num) => parseInt(num) % 10 === 5)
        .reduce((last, next) => last && next);
}
