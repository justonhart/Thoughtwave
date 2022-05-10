import { TransportCreep } from '../virtualCreeps/transportCreep';

// TODO: right now I just copied some of the worker functions over. Find a better way to reuse already existing methods
export class Gatherer extends TransportCreep {
    public run() {
        if (Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].state === RemoteMiningRoomState.ENEMY) {
            this.travelToRoom(this.memory.room, { range: 20 }); // Travel back to home room
            return;
        }

        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            if (this.pos.roomName !== this.memory.assignment) {
                return this.travelToRoom(this.memory.assignment); // travel to room before finding a target
            } else {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
                this.checkConstructionProgress();
                this.checkEnergyState();
            }
        }

        if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer) {
            this.runCollectionJob(target);
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

    private checkEnergyState() {
        let looseResources = this.room.find(FIND_DROPPED_RESOURCES).filter((r) => r.amount > 100);
        if (looseResources.length && !Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].surplusGatherer) {
            const amount = looseResources.reduce((total, resource) => total + resource.amount, 0);
            if (amount > 3000) {
                Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].surplusGatherer = false;
            } else {
                delete Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].surplusGatherer;
            }
        }
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
