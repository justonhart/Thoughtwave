import { isKeeperRoom } from '../modules/data';
import { posExistsOnRoad } from '../modules/roads';
import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    memory: GathererMemory;
    protected run(){
        if(this.memory.early){
            this.runEarly();
        } else {
            this.runFull();
        }
    }

    private runEarly() {
        if(this.store.getUsedCapacity()){
            this.dropCargoEarly()
        } else {
            if(!this.pos.isNearTo(this.getMiningPosition())){
                this.travelTo(this.getMiningPosition(), {range: 1});
            } else {
                let resource = this.getMiningPosition().lookFor(LOOK_RESOURCES).find(res => res.resourceType === RESOURCE_ENERGY);
                if(resource){
                    this.pickup(resource);
                }
            }
        }
    }

    private runFull() {
        if (
            this.memory?.spawnReplacementAt >= Game.time &&
            this.homeroom.memory.remoteSources[this.memory.assignment].gatherers.includes(this.name)
        ) {
            this.triggerReplacementSpawn();
        }

        if (
            this.damaged() ||
            (Memory.remoteData[this.memory.assignment.toRoomPos().roomName]?.evacuate &&
                !this.store.getUsedCapacity())
        ) {
            delete this.memory.targetId;
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        if (this.store.getUsedCapacity()) {
            if (!this.onEdge() && posExistsOnRoad(this.pos) && this.getActiveBodyparts(WORK)) {
                let road = this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_ROAD) as StructureRoad;
                if (road) {
                    this.repairRoad(road);
                    this.storeCargo();
                } else {
                    let site = this.pos.lookFor(LOOK_CONSTRUCTION_SITES).find((site) => site.my && site.structureType === STRUCTURE_ROAD);
                    if (site) {
                        this.build(site);
                    } else {
                        this.pos.createConstructionSite(STRUCTURE_ROAD);
                    }
                }
            } else {
                this.storeCargo();
            }
        } else {
            this.memory.currentTaskPriority = Priority.MEDIUM;
            if (this.pos.isNearTo(this.getMiningPosition())) {
                let container = Game.getObjectById(this.getContainerId()) as StructureContainer;
                if (container && (container.store.getUsedCapacity() > 1000 || container.store.getUsedCapacity() >= this.store.getCapacity())) {
                    this.withdraw(container, Object.keys(container.store).shift() as ResourceConstant);
                    let road = this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_ROAD) as StructureRoad;
                    this.repairRoad(road);
                    this.storeCargo();
                } else if (isKeeperRoom(this.memory.assignment.split('.')[2]) && this.keeperPresentOrSpawning()) {
                    this.avoidLairs();
                }
            } else if (
                isKeeperRoom(this.memory.assignment.split('.')[2]) &&
                this.keeperPresentOrSpawning() &&
                this.pos.getRangeTo(this.memory.assignment.toRoomPos()) <= 7
            ) {
                this.avoidLairs();
            } else {
                this.travelTo(this.getMiningPosition(), { range: 1, useMemoryRoads: true, reusePath: 10000 });
            }
        }
    }

    private avoidLairs() {
        // Always travel away from the same source otherwise it can cause creep to not move at all
        const lairPositions = Object.values(Memory.remoteData[this.memory.assignment.toRoomPos().roomName].sourceKeeperLairs).map((lair) => ({
            pos: lair.pos.toRoomPos(),
            range: 0,
        }));
        if (this.onEdge()) {
            this.travelToRoom(this.memory.assignment.toRoomPos().roomName); // Prevent going in and out of the room
        } else {
            this.travelTo(this.memory.assignment.toRoomPos(), { range: 7, flee: true, goals: lairPositions, maxRooms: 1 }); // Travel out of harms way
        }
    }

    private keeperPresentOrSpawning(): boolean {
        const lair = Memory.remoteData[this.memory.assignment.toRoomPos().roomName].sourceKeeperLairs[this.memory.assignment];
        const lairInRange = Game.getObjectById(lair.id) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 10 || lairInRange?.ticksToSpawn > 295 || (lairInRange && lairInRange.ticksToSpawn === undefined);
    }

    protected storeCargo() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let resourceToStore: any = Object.keys(this.store).shift();
        let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
        let opts = { range: 1, useMemoryRoads: true, reusePath: 10000 } as TravelToOpts;
        switch (storeResult) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.homeroom.storage, opts);
                break;
            case 0:
                delete Memory.rooms[this.memory.room].remoteSources[this.memory.assignment].setupStatus;
                this.manageLifecycle();
                break;
        }
    }

    private dropCargoEarly() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let dropPos = this.homeroom.memory.stampLayout.container.find(stamp => stamp.type === 'center').pos.toRoomPos();
        if(this.pos.isEqualTo(dropPos)){
            this.drop(RESOURCE_ENERGY);
        } else {
            this.travelTo(dropPos);
        }
    }

    private repairRoad(road: StructureRoad): void {
        if (road?.hits < road?.hitsMax) {
            this.repair(road);
        }
    }

    protected damaged(): boolean {
        return this.hits < this.hitsMax * 0.85;
    }

    private getContainerId(): Id<Structure> {
        if (this.memory.targetId) {
            return this.memory.targetId as Id<Structure>;
        }

        if (Game.rooms[this.memory.assignment.toRoomPos().roomName]) {
            let id = this.getMiningPosition()
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER)?.id as Id<StructureContainer>;
            this.memory.targetId = id;
            return id;
        }
    }

    private manageLifecycle(): void {
        const TRIP_LENGTH = Memory.remoteSourceAssignments[this.memory.assignment].roadLength * 3;
        const TICKS_TO_SPAWN = this.body.length * CREEP_SPAWN_TIME;
        const TRIPS_REMAINING = Math.floor(this.ticksToLive / TRIP_LENGTH);
        const TRIPS_PER_SPAWN_CYCLE = TICKS_TO_SPAWN / TRIP_LENGTH;
        const COMPLETION_OF_LAST_TRIP = Game.time + TRIPS_REMAINING * TRIP_LENGTH;
        const START_SPAWNING_REPLACEMENT_AT = COMPLETION_OF_LAST_TRIP - TICKS_TO_SPAWN;
        const SPAWN_CYCLES_REMAINING = Math.floor(TRIPS_REMAINING / TRIPS_PER_SPAWN_CYCLE);

        //determine when to spawn replacement toward end of lifecycle
        if (TRIPS_REMAINING === 0) {
            this.memory.recycle = true;
        } else if (SPAWN_CYCLES_REMAINING <= 1 || TRIPS_REMAINING === 1) {
            this.memory.spawnReplacementAt = START_SPAWNING_REPLACEMENT_AT > Game.time ? START_SPAWNING_REPLACEMENT_AT : Game.time;
        }
    }

    private triggerReplacementSpawn() {
        for (let i = 0; i < this.homeroom.memory.remoteSources[this.memory.assignment].gatherers.length; i++) {
            if (this.homeroom.memory.remoteSources[this.memory.assignment].gatherers[i] === this.name) {
                this.homeroom.memory.remoteSources[this.memory.assignment].gatherers[i] === AssignmentStatus.UNASSIGNED;
            }
        }
    }

    private getMiningPosition(): RoomPosition {
        if (!this.homeroom.memory.remoteSources[this.memory.assignment]) this.memory.recycle = true;
        return this.homeroom.memory.remoteSources[this.memory.assignment]?.miningPos.toRoomPos();
    }
}
