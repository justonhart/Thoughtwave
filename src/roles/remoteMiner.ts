import { isKeeperRoom } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    memory: RemoteMinerMemory;

    protected run() {
        if(this.memory.early){
            this.runEarly();
        } else {
            this.runFull();
        }
    }

    private runEarly() {
        if(this.damaged() || Memory.remoteData[this.memory.assignment.toRoomPos().roomName]?.evacuate){
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return; 
        }

        if(!this.pos.isEqualTo(this.getMiningPosition())){
            this.travelTo(this.getMiningPosition());
        } else {
            let source = Game.getObjectById(this.getSourceId());
            this.harvest(source);
        }
    }

    private runFull() {
        if (Game.time === this.memory.spawnReplacementAt) {
            this.homeroom.memory.remoteSources[this.memory.assignment].miner = AssignmentStatus.UNASSIGNED;
        }
        if (
            (this.damaged() &&
                (!isKeeperRoom(this.memory.assignment.toRoomPos().roomName) ||
                    this.homeroom.memory.remoteSources[this.memory.assignment].setupStatus !== RemoteSourceSetupStatus.BUILDING_CONTAINER ||
                    !this.keeperPresentOrSpawning())) ||
            Memory.remoteData[this.memory.assignment.toRoomPos().roomName]?.evacuate
        ) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        // Clear out left over containers
        if (this.memory.targetId2) {
            const structure = Game.getObjectById(this.memory.targetId2) as StructureContainer;
        if (!structure) {
                delete this.memory.targetId2;
            } else {
                const dismantleStatus = this.dismantle(structure);
                if (dismantleStatus === ERR_NOT_IN_RANGE) {
                    this.travelTo(structure);
                }
                return;
            }
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.getMiningPosition().roomName]) {
            const isAKeeperRoom = isKeeperRoom(this.memory.assignment.toRoomPos().roomName);
            if (
                isAKeeperRoom &&
                this.keeperPresentOrSpawning() &&
                (this.homeroom.memory.remoteSources[this.memory.assignment].setupStatus !== RemoteSourceSetupStatus.BUILDING_CONTAINER ||
                    this.pos.getRangeTo(
                        Object.values(Game.creeps).find(
                            (creep) => creep.memory.role === Role.KEEPER_EXTERMINATOR && creep.memory.assignment === this.memory.assignment
                        )
                    ) > 10)
            ) {
                // Always travel away from the same source otherwise it can cause creep to not move at all
                let closestLair: RoomPosition;
                const lairPositions = Object.entries(Memory.remoteData[this.memory.assignment.toRoomPos().roomName].sourceKeeperLairs)
                    .filter(([sourcePos, lair]) => {
                        if (sourcePos === this.memory.assignment) {
                            closestLair = lair.pos.toRoomPos();
                            return false;
                        }
                        return true;
                    })
                    .map(([sourcePos, lair]) => ({ pos: lair.pos.toRoomPos(), range: 0 }));
                if (this.onEdge()) {
                    this.travelToRoom(this.memory.assignment.toRoomPos().roomName); // Prevent going in and out of the room
                } else {
                    this.travelTo(closestLair, { range: 7, flee: true, goals: lairPositions, maxRooms: 1 }); // Travel out of harms way
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
                            } else {
                                // Prioritize dropped resources (usually from previous attempts to make the container) to hasten construction
                                const droppedResource = this.pos.lookFor(LOOK_RESOURCES).find((s) => s.resourceType === RESOURCE_ENERGY);
                                if (droppedResource) {
                                    this.pickup(this.pos.lookFor(LOOK_RESOURCES).find((s) => s.resourceType === RESOURCE_ENERGY));
                                } else if (Game.getObjectById(this.getSourceId()).energy) {
                                    this.harvest(Game.getObjectById(this.getSourceId()));
                                } else {
                                    this.say('...');
                                }
                            }
                        } else {
                            const result = this.pos.createConstructionSite(STRUCTURE_CONTAINER);
                            if (result === ERR_RCL_NOT_ENOUGH) {
                                // left over extensions from a stronghold
                                const structure = this.room.structures.find(
                                    (s) =>
                                        s.structureType === STRUCTURE_CONTAINER &&
                                        !Object.keys(this.homeroom.memory.remoteSources)?.some((sourcePos) => s.pos.toMemSafe() === sourcePos)
                                );

                                if (structure) {
                                    this.memory.targetId2 = structure.id;
                                }
                            } else {
                                this.homeroom.memory.remoteSources[this.memory.assignment].setupStatus = RemoteSourceSetupStatus.BUILDING_CONTAINER;
                            }
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

    private keeperPresentOrSpawning(): boolean {
        const lair =
            Memory.remoteData[this.memory.assignment.toRoomPos().roomName].sourceKeeperLairs[Game.getObjectById(this.getSourceId()).pos.toMemSafe()];
        const lairInRange = Game.getObjectById(lair.id) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 10 || lairInRange?.ticksToSpawn > 295 || (lairInRange && lairInRange.ticksToSpawn === undefined);
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
        if (!this.homeroom.memory.remoteSources[this.memory.assignment]) this.suicide();
        return this.homeroom.memory.remoteSources[this.memory.assignment].miningPos.toRoomPos();
    }

    private manageLifecycle(): void {
        this.memory.spawnReplacementAt =
            Game.time + this.ticksToLive - this.body.length * 3 - Memory.remoteSourceAssignments[this.memory.assignment].roadLength;
    }
}
