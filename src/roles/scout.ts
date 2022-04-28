import { WaveCreep } from '../virtualCreeps/waveCreep';

// TODO: if scout goes into first room and instantly gets killed (for example cause invader) then another will spawn and do the same thing over and over. Add avoidRooms to RoomMemory with gameTick so creeps will avoid it and other scouted rooms until timer is up
// TODO: right now it wont assign any room with hostileStructures or enemyCreeps (can be improved later to where enemy creeps might not be a deciding factor) ==> could also add this room to avoidRooms globally but might wanna keep check on enemy
export class Scout extends WaveCreep {
    public run() {
        let nextTarget = this.memory.scout?.path[this.memory.scout.path.length - 1];
        if (!nextTarget) {
            // Set memory
            if (!this.memory.scout) {
                this.memory.scout = { path: [this.room.name] };
            }
            if (!Memory.empire.scoutAssignments) {
                Memory.empire.scoutAssignments = {};
            }
            if (!Memory.empire.scoutAssignments[this.memory.room]) {
                Memory.empire.scoutAssignments[this.memory.room] = [];
            }

            if (!Memory.rooms[this.memory.room].remoteMining) {
                Memory.rooms[this.memory.room].remoteMining = {};
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
                if (!Memory.rooms[this.memory.room].remoteMining) {
                    Memory.rooms[this.memory.room].remoteMining = {};
                }
                const sourceIds = this.room.find(FIND_SOURCES).map((source) => source.id);
                if (sourceIds.length) {
                    Memory.rooms[this.memory.room].remoteMining[nextTarget] = sourceIds;
                }
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
                    this.isInDistance(adjacentRoom)
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
     * @returns
     */
    private isInDistance(targetRoom: string): boolean {
        return !PathFinder.search(
            new RoomPosition(25, 25, this.memory.room),
            { pos: new RoomPosition(25, 25, targetRoom), range: 23 },
            { maxCost: 75 }
        ).incomplete;
    }
}
