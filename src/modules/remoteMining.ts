import { getStoragePos } from './roomDesign';

export function calculateRemoteSourceCost(sourcePos: RoomPosition, room: Room) {
    let storagePos = getStoragePos(room);
    console.log(storagePos);

    const path = PathFinder.search(
        storagePos,
        { pos: sourcePos, range: 1 },
        {
            plainCost: 2,
            swampCost: 10,
            roomCallback: (roomName: string) => {
                if (
                    roomName !== room.name &&
                    ![RoomMemoryStatus.RESERVED_ME, RoomMemoryStatus.RESERVED_INVADER, RoomMemoryStatus.VACANT].includes(
                        Memory.roomData[roomName]?.roomStatus
                    )
                ) {
                    return false;
                }

                let matrix = new PathFinder.CostMatrix();
                let roads = Memory.roomData[roomName]?.roads ? Object.values(Memory.roomData[roomName].roads) : [];
                if (roads?.length) {
                    roads.forEach((road) =>
                        road.split(',').forEach((posString) => {
                            let split = posString.split(':').map((v) => parseInt(v));
                            matrix.set(split[0], split[1], 1);
                        })
                    );
                }

                if (roomName === room.name) {
                    room.stamps?.road.forEach((r) => {
                        if (r.rcl <= room.controller.level) matrix.set(r.pos.x, r.pos.y, 1);
                    });
                }

                return matrix;
            },
            maxOps: 10000,
        }
    );

    if (path.incomplete) {
        return ERR_NOT_IN_RANGE;
    }

    return path.cost;
}
