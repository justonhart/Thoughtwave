import { isKeeperRoom } from '../modules/data';
import { Pathing } from '../modules/pathing';
import { posExistsOnRoad } from '../modules/roads';
import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    protected run() {
        if (
            this.damaged() ||
            Memory.remoteData[this.memory.assignment.toRoomPos().roomName]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS
        ) {
            delete this.memory.targetId;
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        if (this.store.getUsedCapacity()) {
            if (!this.onEdge() && posExistsOnRoad(this.pos)) {
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
            if (this.pos.isNearTo(this.memory.assignment.toRoomPos())) {
                let container = Game.getObjectById(this.getContainerId()) as StructureContainer;
                if (container) {
                    this.withdraw(container, Object.keys(container.store).shift() as ResourceConstant);
                    let road = this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_ROAD) as StructureRoad;
                    this.repairRoad(road);
                    this.storeCargo();
                }
            } else {
                this.travelTo(this.memory.assignment.toRoomPos(), { range: 1, useMemoryRoads: true, reusePath: 10000 });
            }
        }
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
                let source = Object.keys(this.homeroom.memory.remoteSources).find(
                    (s) => this.homeroom.memory.remoteSources[s].miningPos === this.memory.assignment
                );
                delete Memory.rooms[this.memory.room].remoteSources[source].setupStatus;
                break;
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

    private destinationSpawningKeeper(): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.getSourceId()];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 20;
    }

    private getSourceId(): Id<Source> {
        if (Game.rooms[this.memory.assignment.toRoomPos().roomName]) {
            let id = this.memory.assignment.toRoomPos().findInRange(FIND_SOURCES, 1)?.pop().id;
            this.memory.targetId = id;
            return id;
        }
    }

    private getContainerId(): Id<Structure> {
        if (this.memory.targetId) {
            return this.memory.targetId as Id<Structure>;
        }

        if (Game.rooms[this.memory.assignment.toRoomPos().roomName]) {
            let id = this.memory.assignment
                .toRoomPos()
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER)?.id;
            return id;
        }
    }
}
