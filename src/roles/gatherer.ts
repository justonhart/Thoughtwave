import { TransportCreep } from '../virtualCreeps/transportCreep';

// TODO: right now I just copied some of the worker functions over. Find a better way to reuse already existing methods
export class Gatherer extends TransportCreep {
    protected run() {
        if (Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment]?.state === RemoteMiningRoomState.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
                // Find target is visibility exists
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
                this.checkConstructionProgress();
                this.checkEnergyStatus();
            }
        }

        if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer) {
            // Workaround for not leaving constructionsite close to target
            if (this.pos.getRangeTo(target) === 2) {
                delete this.memory._m.path;
                this.travelTo(target, { range: 1, preferRoadConstruction: true });
            } else {
                this.runCollectionJob(target);
            }
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
            this.maintainRoad();
        }
    }

    private checkConstructionProgress() {
        const constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
        if (constructionSites.length > 4) {
            Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].needsConstruction = true;
        } else {
            Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].needsConstruction = false;
        }
    }

    private checkEnergyStatus() {
        let looseResources = this.room.find(FIND_DROPPED_RESOURCES).filter((r) => r.amount > 100);
        if (looseResources.length) {
            const amount = looseResources.reduce((total, resource) => total + resource.amount, 0);
            if (amount > 3000) {
                Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].energyStatus = EnergyStatus.SURPLUS;
                return;
            }
        }
        Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].energyStatus = EnergyStatus.STABLE;
    }

    protected findTarget() {
        // Gather
        if (this.store.getUsedCapacity() < this.store.getCapacity() / 2) {
            return this.findCollectionTarget(this.memory.assignment);
        }

        // Hauler
        return this.homeroom.storage?.id;
    }

    protected storeCargo() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let resourceToStore: any = Object.keys(this.store).shift();
        let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
        switch (storeResult) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.homeroom.storage, { ignoreCreeps: true, range: 1, preferRoadConstruction: true });
                break;
            case 0:
                if (this.store[resourceToStore] === this.store.getUsedCapacity()) {
                    this.onTaskFinished();
                }
                break;
            default:
                this.onTaskFinished();
                break;
        }
    }

    /**
     * Repair road on current creep position if necessary
     */
    protected maintainRoad() {
        const site = this.pos
            .look()
            .filter(
                (object) =>
                    (object.type === LOOK_STRUCTURES && object.structure.hits < object.structure.hitsMax) || object.type === LOOK_CONSTRUCTION_SITES
            );
        if (site.length) {
            if (site[0].type === LOOK_CONSTRUCTION_SITES) {
                this.build(site[0].constructionSite);
            } else if (site[0].type === LOOK_STRUCTURES && site[0].structure.hits < site[0].structure.hitsMax) {
                this.repair(site[0].structure);
            }
        }
    }
}
