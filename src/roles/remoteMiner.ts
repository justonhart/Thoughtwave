import { isKeeperRoom } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.memory.assignment.toRoomPos().roomName]) {

            const isAKeeperRoom = isKeeperRoom(this.memory.assignment.toRoomPos().roomName);
            if(isAKeeperRoom && this.keeperSpawning()){
                const lairPositions = Object.values(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).map((lairId) => {
                    return { pos: Game.getObjectById(lairId).pos, range: 0 };
                });
                if (this.onEdge()) {
                    this.travelToRoom(this.memory.assignment); // Prevent going in and out of the room
                } else {
                    this.travelTo(lairPositions.pop(), { range: 7, flee: true, goals: lairPositions, maxRooms: 1 }); // Travel out of harms way
                }
            } else {
                if(!this.pos.isEqualTo(this.memory.assignment.toRoomPos())){
                    this.travelTo(this.memory.assignment.toRoomPos());
                } else {
                    let container = this.pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
                    if(!container){
                        let site = this.pos.lookFor(LOOK_CONSTRUCTION_SITES).find(s => s.structureType === STRUCTURE_CONTAINER);
                        if(site){
                            if(this.store.energy >= this.getActiveBodyparts(WORK) * 5) {
                                this.build(site);
                            } else if(Game.getObjectById(this.getSourceId()).energy) {
                                this.harvest(Game.getObjectById(this.getSourceId()));
                            } else {
                                this.say('...');
                            }
                        } else {
                            this.pos.createConstructionSite(STRUCTURE_CONTAINER);
                            this.homeroom.memory.remoteSources[Game.getObjectById(this.getSourceId()).pos.toMemSafe()].setupStatus = RemoteSourceSetupStatus.BUILDING_CONTAINER;
                        }
                    } else {
                        let source = Game.getObjectById(this.getSourceId());
                        if(this.homeroom.memory.remoteSources[source.pos.toMemSafe()].setupStatus === RemoteSourceSetupStatus.BUILDING_CONTAINER){
                            this.homeroom.memory.remoteSources[source.pos.toMemSafe()].setupStatus = RemoteSourceSetupStatus.BUILDING_ROAD;
                        }
                        if(source.energy && (container.store.getFreeCapacity() || this.store.getFreeCapacity())){
                            this.harvest(source);
                        } else if (container.hits < container.hitsMax){
                            this.repair(container);
                        } else {
                            this.say('...');
                        }
                    }
                }
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private keeperSpawning(): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.getSourceId()];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 20;
    }

    private hasKeeper(target: RoomPosition): boolean {
        return !!target.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }

    private getSourceId(): Id<Source>{
        if(this.memory.targetId){
            return this.memory.targetId as Id<Source>;
        }

        if(Game.rooms[this.memory.assignment.toRoomPos().roomName]){
            let id = this.memory.assignment.toRoomPos().findInRange(FIND_SOURCES, 1)?.pop().id;
            this.memory.targetId = id;
            return id;
        }
    }
}
