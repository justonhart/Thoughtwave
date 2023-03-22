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

export function addHostileRoom(roomName: string) {
    if (!Memory.roomData[roomName]) {
        Memory.roomData[roomName] = { hostile: true, asOf: Game.time };
    }
    Memory.roomData[roomName].hostile = true;
    Memory.roomData[roomName].asOf = Game.time;
}

export function unclaimRoom(roomName: string) {
    let room = Game.rooms[roomName];

    if (room?.controller?.my) {
        room.controller.unclaim();
    }

    if (room?.find(FIND_MY_CONSTRUCTION_SITES).length) {
        room.find(FIND_MY_CONSTRUCTION_SITES).forEach((site) => site.remove());
    }

    Memory.operations = Memory.operations.filter((op) => op.targetRoom !== roomName);
    Memory.spawnAssignments = Memory.spawnAssignments.filter(
        (asssignment) => asssignment.designee !== roomName && asssignment.spawnOpts.memory.destination !== roomName
    );

    let roomCreeps = Object.values(Game.creeps).filter((c) => c.memory.room === roomName);
    roomCreeps.forEach((creep) => {
        // delete creep memory to prevent automatic updates in memory management
        delete Memory.creeps[creep.name];
        creep.suicide();
    });

    Memory.rooms[roomName].unclaim = true;

    return 'done';
}

//returns id
export function addVisionRequest(request: VisionRequest): string | ScreepsReturnCode {
    let observerRooms = Object.keys(Game.rooms).filter((room) => Game.rooms[room].observer);
    let suitableRoom = observerRooms.find((room) => Game.map.getRoomLinearDistance(request.targetRoom, room) <= 5);
    if (suitableRoom) {
        let requestId = `${Game.time}_${visionRequestIncrement++}`;
        Memory.visionRequests[requestId] = request;
        return requestId;
    } else {
        return ERR_NOT_FOUND;
    }
}

export function getExitDirections(roomName: string): DirectionConstant[] {
    return Object.keys(Game.map.describeExits(roomName)).map((key) => parseInt(key)) as DirectionConstant[];
}
