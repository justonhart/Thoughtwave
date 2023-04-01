import { isKeeperRoom } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    protected run() {
        if(Game.time === this.memory.spawnReplacementAt){
            this.homeroom.memory.remoteSources[this.memory.assignment].miner = AssignmentStatus.UNASSIGNED;
        }
        if (
            this.damaged() ||
            Memory.remoteData[this.memory.assignment.toRoomPos().roomName]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS
        ) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.getMiningPosition().roomName]) {
            const isAKeeperRoom = isKeeperRoom(this.memory.assignment.toRoomPos().roomName);
            if (isAKeeperRoom && this.keeperSpawning()) {
                const lairPositions = Object.values(Memory.remoteData[this.memory.assignment.toRoomPos().roomName].sourceKeeperLairs).map(
                    (lairId) => {
                        return { pos: Game.getObjectById(lairId).pos, range: 0 };
                    }
                );
                if (this.onEdge()) {
                    this.travelToRoom(this.memory.assignment.toRoomPos().roomName); // Prevent going in and out of the room
                } else {
                    this.travelTo(lairPositions.pop(), { range: 7, flee: true, goals: lairPositions, maxRooms: 1 }); // Travel out of harms way
                }
            } else {
                if (!this.pos.isEqualTo(this.getMiningPosition())) {
                    this.travelTo(this.getMiningPosition(), { useMemoryRoads: true });
                } else {
                    let container = this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
                    if (!container) {
                        let site = this.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                        if (site) {
                            if (this.store.energy >= this.getActiveBodyparts(WORK) * 5) {
                                this.build(site);
                            } else if (Game.getObjectById(this.getSourceId()).energy) {
                                this.harvest(Game.getObjectById(this.getSourceId()));
                            } else {
                                this.say('...');
                            }
                        } else {
                            this.pos.createConstructionSite(STRUCTURE_CONTAINER);
                            this.homeroom.memory.remoteSources[this.memory.assignment].setupStatus = RemoteSourceSetupStatus.BUILDING_CONTAINER;
                        }
                    } else {
                        if (this.homeroom.memory.remoteSources[this.memory.assignment].setupStatus === RemoteSourceSetupStatus.BUILDING_CONTAINER) {
                            this.homeroom.memory.remoteSources[this.memory.assignment].setupStatus = RemoteSourceSetupStatus.BUILDING_ROAD;
                        }

                        let source = Game.getObjectById(this.getSourceId());
                        if (this.store.energy && container.hits < container.hitsMax) {
                            this.repair(container);
                        } else if (source.energy && (container.store.getFreeCapacity() || this.store.getFreeCapacity())) {
                            this.harvest(source);
                        } else {
                            this.say('...');
                        }
                    }
                }
            }
        } else {
            this.travelTo(this.memory.assignment.toRoomPos(), { useMemoryRoads: true });
        }
    }

    private keeperSpawning(): boolean {
        const lairId = Memory.remoteData[this.memory.assignment.toRoomPos().roomName].sourceKeeperLairs[this.getSourceId()];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 20;
    }

    private hasKeeper(target: RoomPosition): boolean {
        return !!target.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }

    private getSourceId(): Id<Source> {
        if (this.memory.targetId) {
            return this.memory.targetId as Id<Source>;
        }

        if (Game.rooms[this.memory.assignment.toRoomPos().roomName]) {
            this.manageLifecycle(); //this is only reached once and is only called once creep is at miningPos
            let id = this.memory.assignment.toRoomPos().lookFor(LOOK_SOURCES)?.pop().id;
            this.memory.targetId = id;
            return id;
        }
    }

    private getMiningPosition(): RoomPosition {
        return this.homeroom.memory.remoteSources[this.memory.assignment].miningPos.toRoomPos();
    }

    private manageLifecycle(): void{
        this.memory.spawnReplacementAt = Game.time + this.ticksToLive - this.body.length * 3 - Memory.remoteSourceAssignments[this.memory.assignment].roadLength;
    }
}
