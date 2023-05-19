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

        const hasPowerBank = room.structures.filter((s) => s.structureType === STRUCTURE_POWER_BANK).length > 0;
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
            const boostedAttacker = room.hostileCreeps.find(
                (creep) =>
                    creep.owner.username !== 'Invader' &&
                    creep.getActiveBodyparts(TOUGH) &&
                    creep.getActiveBodyparts(ATTACK) + creep.getActiveBodyparts(RANGED_ATTACK) + creep.getActiveBodyparts(WORK) > 0 &&
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

    Memory.operations = Memory.operations.filter((op) => op.targetRoom !== roomName);
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

//returns id
export function addVisionRequest(request: VisionRequest): string | ScreepsReturnCode {
    let observerRooms = Object.keys(Game.rooms).filter((room) => Game.rooms[room].observer);
    let suitableRoom = observerRooms.find((room) => Game.map.getRoomLinearDistance(request.targetRoom, room) <= 10);
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

export function getBunkerPositions(room: Room): RoomPosition[] {
    if (room.memory.anchorPoint) {
        let anchor = room.memory.anchorPoint.toRoomPos();
        let posArr = [];
        for (let i = -6; i < 7; i++) {
            for (let j = -6; j < 7; j++) {
                posArr.push(room.getPositionAt(anchor.x + i, anchor.y + j));
            }
        }
        return posArr;
    }
}

export function getStructureForPos(layout: RoomLayout, targetPos: RoomPosition, anchorPoint: RoomPosition): BuildableStructureConstant {
    switch (layout) {
        case RoomLayout.BUNKER:
            let xdif = targetPos.x - anchorPoint.x;
            let ydif = targetPos.y - anchorPoint.y;

            if (targetPos === anchorPoint || Math.abs(xdif) >= 7 || Math.abs(ydif) >= 7) {
                return undefined;
            }

            if (xdif === 0) {
                switch (ydif) {
                    case 1:
                        return STRUCTURE_TERMINAL;
                    case -1:
                        return STRUCTURE_SPAWN;
                    case -2:
                    case 2:
                    case -6:
                    case 6:
                        return STRUCTURE_EXTENSION;
                    default:
                        return STRUCTURE_ROAD;
                }
            }

            if (ydif === 0) {
                switch (xdif) {
                    case -2:
                        return STRUCTURE_OBSERVER;
                    case -1:
                        return STRUCTURE_LINK;
                    case 1:
                        return STRUCTURE_FACTORY;
                    case 2:
                        return STRUCTURE_SPAWN;
                    default:
                        return STRUCTURE_ROAD;
                }
            }

            if (Math.abs(xdif) === 6 || Math.abs(ydif) === 6) {
                return STRUCTURE_ROAD;
            }

            if (ydif === -1 && xdif === -1) {
                return STRUCTURE_SPAWN;
            }
            if (ydif === -1 && xdif === 1) {
                return STRUCTURE_STORAGE;
            }
            if (ydif === 1 && xdif === 1) {
                return STRUCTURE_POWER_SPAWN;
            }
            if (ydif === 1 && xdif === -1) {
                return STRUCTURE_NUKER;
            }

            if (Math.abs(ydif) === Math.abs(xdif) && Math.abs(ydif) <= 5) {
                return STRUCTURE_ROAD;
            }
            if ((ydif === -3 && xdif >= -1 && xdif <= 2) || (xdif === 3 && ydif >= -2 && ydif <= 1)) {
                return STRUCTURE_TOWER;
            }
            if (ydif <= -2 && ydif >= -5 && xdif <= -3 && xdif >= -4) {
                return STRUCTURE_LAB;
            }
            if (ydif <= -3 && ydif >= -4 && (xdif === -2 || xdif === -5)) {
                return STRUCTURE_LAB;
            }

            if ((Math.abs(ydif) === 2 && Math.abs(xdif) === 1) || (Math.abs(xdif) === 2 && Math.abs(ydif) === 1)) {
                return STRUCTURE_ROAD;
            }

            return STRUCTURE_EXTENSION;
    }
}

export function isHighway(roomName: string): boolean {
    const parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName) as unknown;
    return parsed[1] % 10 === 0 || parsed[2] % 10 === 0;
}
