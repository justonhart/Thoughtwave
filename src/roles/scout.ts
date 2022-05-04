import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Scout extends WaveCreep {
    public run() {
        let nextTarget = this.memory.scout?.path[this.memory.scout.path.length - 1];
        if (!nextTarget) {
            // Set memory
            if (!this.memory.scout) {
                this.memory.scout = { path: [this.room.name], spawn: this.pos.toMemSafe() };
            }
            if (!Memory.empire.scoutAssignments) {
                Memory.empire.scoutAssignments = {};
            }
            if (!Memory.empire.scoutAssignments[this.memory.room]) {
                Memory.empire.scoutAssignments[this.memory.room] = [];
            }

            nextTarget = this.findTarget();

            this.memory.scout.path.push(nextTarget);
        }

        // Go to the target room
        if (this.travelToRoom(nextTarget) === IN_ROOM) {
            // Set Room memory
            if (
                !this.room.controller?.owner?.username &&
                !this.room.find(FIND_HOSTILE_CREEPS, {
                    filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
                }).length
            ) {
                this.room.find(FIND_SOURCES).forEach((source) => {
                    const pathFinder = this.getPath(source.pos);
                    if (
                        !pathFinder.incomplete &&
                        !Memory.rooms[this.memory.room].miningAssignments[pathFinder.path[pathFinder.path.length - 1].toMemSafe()]
                    ) {
                        Memory.rooms[this.memory.room].miningAssignments[pathFinder.path[pathFinder.path.length - 1].toMemSafe()] =
                            AssignmentStatus.UNASSIGNED;
                        if (!Memory.rooms[this.memory.room].remoteAssignments[this.room.name]) {
                            Memory.rooms[this.memory.room].remoteAssignments[this.room.name].distributor = AssignmentStatus.UNASSIGNED;
                            Memory.rooms[this.memory.room].remoteAssignments[this.room.name].reserver = AssignmentStatus.UNASSIGNED;
                        }
                    }
                });
                nextTarget = this.findTarget();
            } else {
                nextTarget = this.findTarget(true);
            }

            this.memory.scout.path.push(nextTarget);
        }
    }

    /**
     * Find new room for scout to check out.
     *
     * @param ignoreCurrentRoom Avoid looking for new exits from current room
     * @returns new scoutTarget
     */
    private findTarget(ignoreCurrentRoom?: boolean): string {
        // Find all exits but filter for those that are not yet in empire memory unless currentRoom has hostiles
        if (!ignoreCurrentRoom) {
            const adjacentRooms = Object.values(Game.map.describeExits(this.room.name)).filter(
                (adjacentRoom) =>
                    adjacentRoom !== undefined &&
                    !Game.rooms[adjacentRoom] &&
                    ![].concat(...Object.values(Memory.empire.scoutAssignments)).includes(adjacentRoom) &&
                    Game.map.getRoomLinearDistance(this.memory.room, adjacentRoom) < 2
            );

            // Add rooms if scout hasn't been there yet
            if (adjacentRooms.length) {
                Memory.empire.scoutAssignments[this.memory.room].unshift(...adjacentRooms);
            }
        }

        // check empire memory against scout travelHistory to see if any rooms are left.
        let nextRoom: string = Memory.empire.scoutAssignments[this.memory.room].find(
            (roomToScout: string) => !this.memory.scout.path.includes(roomToScout)
        );

        // Exit Condition
        if (!nextRoom) {
            console.log(`${this.name} has finished scouting.`);
            this.suicide();
            return;
        }

        return nextRoom;
    }

    /**
     * Calculate path to target from homeBase. Set higher maxCost to let the scout go further from his base ==> costOutsideOfBase = maxCost - 25
     * Swamp cost is set to 2 since roadCost is higher therefor it will not be as efficient
     * @returns
     */
    private getPath(target: RoomPosition): PathFinderPath {
        return PathFinder.search(posFromMem(this.memory.scout.spawn), { pos: target, range: 1 }, { plainCost: 1, swampCost: 2, maxCost: 90 }); // TODO how far is still efficient?
    }
}
