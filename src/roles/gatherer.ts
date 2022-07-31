import { getUsername } from '../modules/data';
import { posFromMem } from '../modules/data';
import { Pathing } from '../modules/pathing';
import { getStructureForPos, posInsideBunker } from '../modules/roomDesign';
import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
                // Find target is visibility exists
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }
        }

        if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer) {
            this.runCollectionJob(target);
        } else if (target instanceof StructureStorage) {
            if (this.store.energy) {
                if (!this.getActiveBodyparts(WORK) || !this.shouldBuildRoad() || this.roadIsServicable()) {
                    this.storeCargo();
                    this.repairRoad();
                } else {
                    this.workOnRoad();
                }
            } else {
                delete this.memory.targetId;
            }
        } else {
            delete this.memory.targetId;
        }
    }

    protected findTarget() {
        // Gather
        if (this.store.getUsedCapacity() < this.store.getCapacity() * 0.8) {
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
                this.memory.shouldBuildRoad = true;
                break;
            default:
                this.onTaskFinished();
                break;
        }
    }

    /**
     * Repair road on current creep position if necessary
     */
    private workOnRoad() {
        const site = this.pos
            .look()
            .find(
                (object) =>
                    (object.type === LOOK_STRUCTURES &&
                        object.structure.structureType === STRUCTURE_ROAD &&
                        object.structure.hits < object.structure.hitsMax) ||
                    (object.type === LOOK_CONSTRUCTION_SITES && object.constructionSite.structureType === STRUCTURE_ROAD)
            );
        if (site) {
            if (site.type === LOOK_CONSTRUCTION_SITES) {
                this.build(site.constructionSite);
            } else if (site.type === LOOK_STRUCTURES) {
                this.repair(site.structure);
            }
        } else {
            this.room.createConstructionSite(this.pos, STRUCTURE_ROAD);
        }
    }

    private roadIsServicable(): boolean {
        const road = this.pos.lookFor(LOOK_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_ROAD);
        if (road && road.hits > road.hitsMax * 0.75) {
            return true;
        } else {
            return false;
        }
    }

    private shouldBuildRoad(): boolean {
        return (
            this.memory.shouldBuildRoad &&
            !this.onEdge() &&
            !this.memory._m?.repath &&
            (!this.room.controller?.owner ||
                this.room.controller?.reservation?.username === getUsername() ||
                (this.room.controller?.owner?.username === getUsername() &&
                    this.room.memory.layout === RoomLayout.BUNKER &&
                    (!posInsideBunker(this.pos) ||
                        getStructureForPos(this.room.memory.layout, this.pos, posFromMem(this.room.memory.anchorPoint)) === STRUCTURE_ROAD)))
        );
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> {
        let miningPositions = Memory.remoteData[roomName].miningPositions;

        let targets: { id: Id<Resource> | Id<Structure>; amount: number; shouldBuildRoad?: boolean }[] = [];

        miningPositions.forEach((posString) => {
            let pos = posFromMem(posString);
            const areaInRange = Pathing.getArea(pos, 3);
            let lookArea = this.room.lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true);
            if (lookArea.some((look) => look.creep?.owner?.username === 'Source Keeper')) {
                return;
            }

            lookArea
                .filter((look) => look.resource?.resourceType === RESOURCE_ENERGY)
                .forEach((resource) => targets.push({ id: resource.resource.id, amount: resource.resource.amount, shouldBuildRoad: false }));

            let container: StructureContainer = pos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (container && container.store.getUsedCapacity()) {
                targets.push({ id: container.id, amount: container.store.getUsedCapacity(), shouldBuildRoad: true });
            }
        });

        const selectedTarget = targets.length ? targets.reduce((highest, next) => (highest.amount > next.amount ? highest : next)) : undefined;

        if (selectedTarget?.shouldBuildRoad === false) {
            this.memory.shouldBuildRoad = false;
        }
        return selectedTarget?.id;
    }

    private repairRoad(): void {
        const road = this.pos.lookFor(LOOK_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_ROAD);
        if (road?.hits < road?.hitsMax) {
            this.repair(road);
        }
    }
}
