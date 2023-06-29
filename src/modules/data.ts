export function addRoomData(room: Room) {
    let data: RoomData = {
        sources: room.find(FIND_SOURCES).map((source) => `${source.pos.x}.${source.pos.y}`),
        mineralType: room.mineral?.mineralType,
        asOf: Game.time,
    };

    Memory.roomData[room.name] = data;

    updateRoomData(room);
}

export function computeRoomNameFromDiff(startingRoomName: string, xDiff: number, yDiff: number) {
    //lets say W0 = E(-1), S1 = N(-1)

    let values = startingRoomName
        .replace('N', '.N')
        .replace('S', '.S')
        .split('.')
        .map((v) => {
            if (v.startsWith('E') || v.startsWith('N')) {
                return parseInt(v.slice(1));
            } else {
                return -1 * parseInt(v.slice(1)) - 1;
            }
        });

    let startX = values[0];
    let startY = values[1];

    let targetValues = [startX + xDiff, startY + yDiff];

    return targetValues
        .map((v, index) => {
            if (v >= 0) {
                return index === 0 ? 'E' + v : 'N' + v;
            } else {
                return index === 0 ? 'W' + (-1 * v - 1) : 'S' + (-1 * v - 1);
            }
        })
        .reduce((sum, next) => sum + next);
}

export function updateRoomData(room: Room) {
    let data = Memory.roomData[room.name];

    let controllingInvaderCore: StructureInvaderCore = room.hostileStructures.find(
        (s) => s.structureType === STRUCTURE_INVADER_CORE && s.level
    ) as StructureInvaderCore;
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

    if (isHighway(room.name)) {
        delete data.deposits;

        const hasPowerBank = room.structures.some((s) => s.structureType === STRUCTURE_POWER_BANK);
        if (hasPowerBank && data.powerBank !== false) {
            data.powerBank = true;
        } else if (!hasPowerBank) {
            delete data.powerBank; // only delete it when there is none since it will be set to false if it is not a powerBank we want to get (saves cpu)
        }

        const deposits = room.find(FIND_DEPOSITS);
        if (deposits.length) {
            data.deposits = deposits.map((deposit) => deposit.depositType);
        }
    }

    data.asOf = Game.time;

    // Only check for enemies on non-owned rooms
    if (data.roomStatus < RoomMemoryStatus.OWNED_OTHER) {
        // Get all OWNED_ME adjacent rooms
        const isAdjacentToOwnedRoom = Object.values(Game.map.describeExits(room.name)).some((exitRoomName) => Memory.rooms[exitRoomName]);
        if (isAdjacentToOwnedRoom) {
            const boostedAttacker = room.hostileCreeps.some(
                (creep) =>
                    creep.owner.username !== 'Invader' &&
                    creep.hasActiveBodyparts(TOUGH) &&
                    (creep.hasActiveBodyparts(ATTACK) || creep.hasActiveBodyparts(RANGED_ATTACK) || creep.hasActiveBodyparts(WORK)) &&
                    creep.body.some((part) => part.boost)
            );
            if (boostedAttacker) {
                data.threatDetected = true;
            } else {
                data.threatDetected = false;
            }
        }
    }

    Memory.roomData[room.name] = data;
}

export function getUsername(): string {
    if (!Memory.username) {
        Memory.username =
            Object.values(Game.spawns)?.shift()?.owner.username ||
            Object.values(Game.creeps)?.shift()?.owner.username ||
            Object.values(Game.rooms).find((room) => room.controller?.my).controller.owner.username;
    }

    return Memory.username;
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

    if (room?.myConstructionSites.length) {
        room.myConstructionSites.forEach((site) => site.remove());
    }

    Object.entries(Memory.operations)
        .filter(([id, operation]) => operation.targetRoom !== roomName)
        .forEach(([id, op]) => delete Memory.operations[id]);
    Memory.spawnAssignments = Memory.spawnAssignments.filter(
        (asssignment) => asssignment.designee !== roomName && asssignment.spawnOpts.memory.destination !== roomName
    );

    room.myCreepsByMemory.forEach((creep) => {
        // delete creep memory to prevent automatic updates in memory management
        delete Memory.creeps[creep.name];
        creep.suicide();
    });

    Memory.rooms[roomName].unclaim = true;

    return 'done';
}

export function observerInRange(roomName: string): boolean {
    const observerRooms = Object.keys(Game.rooms).filter((room) => Game.rooms[room].observer);
    return observerRooms.some((room) => Game.map.getRoomLinearDistance(roomName, room) <= 10);
}

//returns id
export function addVisionRequest(request: VisionRequest): string {
    let requestId = `${Game.time}_${identifierIncrement++}`;
    Memory.visionRequests[requestId] = request;
    return requestId;
}

export function getExitDirections(roomName: string): DirectionConstant[] {
    return Object.keys(Game.map.describeExits(roomName)).map((key) => parseInt(key)) as DirectionConstant[];
}

export function isHighway(roomName: string): boolean {
    const parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName) as unknown;
    return parsed[1] % 10 === 0 || parsed[2] % 10 === 0;
}

export function getEmpireData(): EmpireData {
    return {
        roomCap: Game.gcl.level,
        roomsOwned: Object.values(Game.rooms).reduce((sum, nextRoom) => (nextRoom.controller?.my ? sum + 1 : sum), 0),
    };
}
