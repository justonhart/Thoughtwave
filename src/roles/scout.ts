import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Scout extends WaveCreep {
    protected run() {
        // let nextTarget = this.memory.scout?.path[this.memory.scout.path.length - 1];
        // if (!nextTarget) {
        //     // Set memory
        //     if (!this.memory.scout) {
        //         this.memory.scout = { path: [this.room.name], spawn: this.pos.toMemSafe() };
        //     }
        //     if (!Memory.empire.scoutAssignments) {
        //         Memory.empire.scoutAssignments = {};
        //     }
        //     if (!Memory.empire.scoutAssignments[this.memory.room]) {
        //         Memory.empire.scoutAssignments[this.memory.room] = [];
        //     }
        //     nextTarget = this.findTarget();
        //     this.memory.scout.path.push(nextTarget);
        // }
        // // Go to the target room
        // if (this.travelToRoom(nextTarget, { checkForHostilesAtDestination: true }) === IN_ROOM) {
        //     const maxRemoteMiningRooms = this.homeroom.controller.level < 7 ? 3 : 6;
        //     // Set Room memory
        //     if (
        //         Game.shard.name !== 'shard3' &&
        //         Object.keys(this.homeroom.memory.remoteAssignments).length < maxRemoteMiningRooms &&
        //         !this.room.controller?.owner?.username &&
        //         (!this.room.controller?.reservation?.username ||
        //             this.room.controller?.reservation?.username === this.owner.username ||
        //             this.room.controller?.reservation?.username === 'Invader') &&
        //         !Memory.empire.hostileRooms.find((room) => room.room === this.room.name) &&
        //         !this.room.find(FIND_HOSTILE_CREEPS, {
        //             filter: (creep) => creep.getActiveBodyparts(ATTACK) > 0 || creep.getActiveBodyparts(RANGED_ATTACK) > 0,
        //         }).length &&
        //         !this.room.find(FIND_HOSTILE_STRUCTURES, {
        //             filter: (struct) => struct.structureType === STRUCTURE_KEEPER_LAIR,
        //         }).length
        //     ) {
        //         this.room.find(FIND_SOURCES).forEach((source) => {
        //             const pathFinder = this.getPath(source.pos);
        //             if (
        //                 !pathFinder.incomplete &&
        //                 !Memory.rooms[this.memory.room].remoteAssignments[this.room.name]?.miners[
        //                     pathFinder.path[pathFinder.path.length - 1].toMemSafe()
        //                 ]
        //             ) {
        //                 // Set Miner/Gatherer/Reserver
        //                 if (!Memory.rooms[this.memory.room].remoteAssignments[this.room.name]) {
        //                     Memory.rooms[this.memory.room].remoteAssignments[this.room.name] = {
        //                         miners: new Map(),
        //                         gatherer: AssignmentStatus.UNASSIGNED,
        //                         reserver: AssignmentStatus.UNASSIGNED,
        //                         needsConstruction: true,
        //                         energyStatus: EnergyStatus.STABLE,
        //                         state: RemoteMiningRoomState.SAFE,
        //                         controllerState: RemoteMiningRoomControllerState.LOW,
        //                     };
        //                 }
        //                 Memory.rooms[this.memory.room].remoteAssignments[this.room.name].miners[
        //                     pathFinder.path[pathFinder.path.length - 1].toMemSafe()
        //                 ] = AssignmentStatus.UNASSIGNED;
        //             }
        //         });
        //         nextTarget = this.findTarget();
        //     } else {
        //         nextTarget = this.findTarget(true);
        //     }
        //     this.memory.scout.path.push(nextTarget);
        // }
    }

    /**
     * Find new room for scout to check out.
     *
     * @param ignoreCurrentRoom Avoid looking for new exits from current room
     * @returns new scoutTarget
     */
    // private findTarget(ignoreCurrentRoom?: boolean): string {
    //     // Find all exits but filter for those that are not yet in empire memory unless currentRoom has hostiles
    //     if (!ignoreCurrentRoom) {
    //         const adjacentRooms = Object.values(Game.map.describeExits(this.room.name)).filter(
    //             (adjacentRoom) =>
    //                 adjacentRoom !== undefined &&
    //                 !Game.rooms[adjacentRoom] &&
    //                 ![].concat(...Object.values(Memory.empire.scoutAssignments)).includes(adjacentRoom) &&
    //                 Game.map.getRoomLinearDistance(this.memory.room, adjacentRoom) < 2
    //         );

    //         // Add rooms if scout hasn't been there yet
    //         if (adjacentRooms.length) {
    //             Memory.empire.scoutAssignments[this.memory.room].push(...adjacentRooms);
    //         }
    //     }

    //     // check empire memory against scout travelHistory to see if any rooms are left.
    //     const nextRoom: string = Memory.empire.scoutAssignments[this.memory.room].find(
    //         (roomToScout: string) => !this.memory.scout.path.includes(roomToScout)
    //     );

    //     // Exit Condition
    //     if (!nextRoom) {
    //         console.log(`${this.name} has finished scouting.`);
    //         this.suicide();
    //         return;
    //     }

    //     return nextRoom;
    // }

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
