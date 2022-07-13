import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Scout extends WaveCreep {
    protected run() {
        let nextTarget = this.memory.scout?.path[this.memory.scout.path.length - 1];
        if (!nextTarget) {
            // Set memory
            if (!this.memory.scout) {
                this.memory.scout = { path: [this.room.name], spawn: this.pos.toMemSafe() };
            }

            nextTarget = this.findTarget();

            this.memory.scout.path.push(nextTarget);
        }

        // Go to the target room
        if (this.travelToRoom(nextTarget, { checkForHostilesAtDestination: true }) === IN_ROOM) {
            const maxRemoteMiningRooms = this.homeroom.controller.level < 7 ? 3 : 6;
            // Set Room memory
            if (
                Game.shard.name !== 'shard3' &&
                Object.keys(this.homeroom.memory.remoteMiningRooms).length < maxRemoteMiningRooms &&
                !this.room.controller?.owner?.username &&
                (!this.room.controller?.reservation?.username ||
                    this.room.controller?.reservation?.username === this.owner.username ||
                    this.room.controller?.reservation?.username === 'Invader') &&
                !Memory.roomData[this.room.name]?.hostile &&
                !this.room.find(FIND_HOSTILE_CREEPS, {
                    filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
                }).length &&
                !this.room.find(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_KEEPER_LAIR,
                }).length
            ) {
                this.room.find(FIND_SOURCES).forEach((source) => {});
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
        return undefined;
    }

    /**
     * Calculate path to target from homeBase. Set higher maxCost to let the scout go further from his base ==> costOutsideOfBase = maxCost - 25
     * Swamp cost is set to 2 since roadCost is higher therefor it will not be as efficient
     * @returns
     */
    private getPath(target: RoomPosition): PathFinderPath {
        return PathFinder.search(
            posFromMem(this.memory.scout.spawn),
            { pos: target, range: 1 },
            { plainCost: 1, swampCost: 2, maxCost: this.homeroom.controller.level < 7 ? 70 : 90 }
        );
    }
}
