import { CombatCreep } from '../virtualCreeps/combatCreep';
import { HomeRoomCombatPlanner } from './homeRoomCombatPlanner';

export class CombatPlanner {
    protected room: Room;
    protected exitRooms: string[];
    protected memory: CombatPlannerMemory;

    public constructor(room: Room) {
        this.room = room;
        this.memory = room.memory.combatPlanner;
        this.exitRooms = Object.values(Game.map.describeExits(room.name));
        let combatPlanner: CombatPlanner;
        try {
            switch (room.memory.roomType) {
                case RoomType.HOMEROOM:
                    combatPlanner = new HomeRoomCombatPlanner(room);
                    break;
            }

            combatPlanner.run();
        } catch (e) {
            console.log(`Error caught for CombatPlanner in ${room.name}: \n${e}`);
        }
    }

    protected run() {
        console.log(`Running general CombatPlanner for ${this.room.name}`);
    }

    /**
     * Get enemy combat units
     * @param targetRoom -
     * @returns -
     */
    protected getAggressiveHostileCreeps(targetRoom?: Room): Creep[] {
        if (!targetRoom) {
            targetRoom = this.room;
        }
        return targetRoom.hostileCreeps.filter(
            (hostileCreep) => hostileCreep.getActiveBodyparts(RANGED_ATTACK) || hostileCreep.getActiveBodyparts(ATTACK)
        );
    }

    /**
     * Creeps vs Creep combat without ramparts.
     * TODO: Instead of target set targetPos? If target is set currently the rampartProtector does not attack any other creep than the target even if it is out of range.
     * @param target
     * @returns
     */
    protected setCreepTarget(myCreeps: CombatCreep[]) {
        const target = this.findCombatTarget();

        myCreeps.forEach((creep) => {
            creep.memory.targetId = target?.id;
        });
    }

    /**
     * Find enemy combat target in creep to creep battle.
     */
    protected findCombatTarget(): Creep {
        return undefined;
    }

    /**
     * Convert this exit position to the corresponding one in the next room
     * @param pos
     */
    protected convertEdgePosition(pos: RoomPosition, direction: ExitConstant) {
        const { x, y, roomName } = pos;

        let newX = x;
        let newY = y;
        let newRoomName = roomName;

        // Handle different directions
        if (direction === TOP) {
            newY = 49;
            newRoomName = this.getAdjacentRoom(roomName, TOP);
        } else if (direction === LEFT) {
            newX = 49;
            newRoomName = this.getAdjacentRoom(roomName, LEFT);
        } else if (direction === RIGHT) {
            newX = 0;
            newRoomName = this.getAdjacentRoom(roomName, RIGHT);
        } else if (direction === BOTTOM) {
            newY = 0;
            newRoomName = this.getAdjacentRoom(roomName, BOTTOM);
        }

        return new RoomPosition(newX, newY, newRoomName);
    }

    protected getAdjacentRoom(roomName: string, direction: ExitConstant) {
        const [x, y] = roomName.match(/\d+/g).map(Number);

        // Calculate adjacent room coordinates based on direction
        if (direction === TOP) {
            return `${x},${y - 1}`;
        } else if (direction === LEFT) {
            return `${x - 1},${y}`;
        } else if (direction === RIGHT) {
            return `${x + 1},${y}`;
        } else if (direction === BOTTOM) {
            return `${x},${y + 1}`;
        }

        return roomName; // Default to the same room name if direction is not recognized
    }
}
