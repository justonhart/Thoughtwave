import { getUsername } from '../modules/data';
import { posFromMem } from '../modules/memoryManagement';
import { getStructureForPos, posInsideBunker } from '../modules/roomDesign';
import { TransportCreep } from '../virtualCreeps/transportCreep';

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
                this.checkEnergyStatus();
            }
        }

        if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer) {
            this.runCollectionJob(target);
        } else if (target instanceof StructureStorage) {
            if (this.store.energy) {
                if (!this.shouldBuildRoad() || (this.shouldBuildRoad && this.roadIsFull())) {
                    this.storeCargo();
                } else {
                    this.maintainRoad();
                }
            } else {
                delete this.memory.targetId;
            }
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
    private maintainRoad() {
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
        } else {
            this.room.createConstructionSite(this.pos, STRUCTURE_ROAD);
        }
    }

    private roadIsFull(): boolean {
        const road = this.pos.lookFor(LOOK_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_ROAD);
        if (road && road.hits === road.hitsMax) {
            return true;
        } else {
            return false;
        }
    }

    private shouldBuildRoad(): boolean {
        return (
            !this.onEdge() &&
            (!this.room.controller?.owner ||
                this.room.controller?.reservation?.username === getUsername() ||
                (this.room.controller?.owner?.username === getUsername() &&
                    this.room.memory.layout === RoomLayout.BUNKER &&
                    (!posInsideBunker(this.pos) ||
                        getStructureForPos(this.room.memory.layout, this.pos, posFromMem(this.room.memory.anchorPoint)) === STRUCTURE_ROAD)))
        );
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> {
        let miningPositions = Object.keys(Memory.rooms[this.memory.room].remoteAssignments[this.memory.assignment].miners);

        let targets: { id: Id<Resource> | Id<Structure>; amount: number }[] = [];

        miningPositions.forEach((posString) => {
            let pos = posFromMem(posString);
            let target: Id<Resource> | Id<Structure>;

            let resource = pos.lookFor(LOOK_RESOURCES).shift();
            if (resource) {
                targets.push({ id: resource.id, amount: resource.amount });
            }

            let container: StructureContainer = pos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (container && container.store.getUsedCapacity()) {
                targets.push({ id: container.id, amount: container.store.getUsedCapacity() });
            }
        });

        return targets.length ? targets.reduce((highest, next) => (highest.amount > next.amount ? highest : next))?.id : undefined;
    }
}
