import { getUsername, isKeeperRoom } from '../modules/data';
import { posFromMem } from '../modules/data';
import { Pathing } from '../modules/pathing';
import { getStructureForPos, posInsideBunker } from '../modules/roomDesign';
import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            delete this.memory.targetId;
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        // Reset when not carrying energy anymore
        if (!this.store.getUsedCapacity()) {
            this.memory.shouldBuildRoad = true;
        }

        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            if (Game.rooms[this.memory.assignment] || this.travelToRoom(this.memory.assignment) === IN_ROOM) {
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
                    (this.room.memory.layout !== RoomLayout.BUNKER ||
                        (this.room.memory.layout === RoomLayout.BUNKER &&
                            (!posInsideBunker(this.pos) ||
                                getStructureForPos(this.room.memory.layout, this.pos, posFromMem(this.room.memory.anchorPoint)) ===
                                    STRUCTURE_ROAD)))))
        );
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> | Id<Tombstone> {
        const miningPositions = Memory.remoteData[roomName].miningPositions;

        const targets: { id: Id<Resource> | Id<Structure> | Id<Tombstone>; amount: number; shouldBuildRoad?: boolean }[] = [];

        Object.values(miningPositions).forEach((posString) => {
            const pos = posFromMem(posString);
            const areaInRange = Pathing.getArea(pos, 3);
            const lookArea = Game.rooms[roomName].lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true);
            if (
                isKeeperRoom(pos.roomName) &&
                (lookArea.some((look) => look.creep?.owner?.username === 'Source Keeper') || this.destinationSpawningKeeper(posString))
            ) {
                return;
            }
            lookArea
                .filter((look) => look.resource?.resourceType === RESOURCE_ENERGY || look.tombstone?.store.energy)
                .forEach((look) => {
                    if (look.resource) {
                        targets.push({ id: look.resource.id, amount: look.resource.amount, shouldBuildRoad: false });
                    } else {
                        targets.push({ id: look.tombstone.id, amount: look.tombstone.store?.energy, shouldBuildRoad: false });
                    }
                });

            const container: StructureContainer = pos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (container && container.store.getUsedCapacity()) {
                targets.push({ id: container.id, amount: container.store.getUsedCapacity(), shouldBuildRoad: true });
            }
        });

        // Ensure that if there are 2 gatherers they do not go toward same target
        const isMainGatherer = this.name === Memory.remoteData[roomName].gatherer;
        const secondGatherer = isMainGatherer ? Memory.remoteData[roomName].gathererSK : Memory.remoteData[roomName].gatherer;
        let excludeTargetId: string;
        if (secondGatherer && secondGatherer !== AssignmentStatus.UNASSIGNED) {
            excludeTargetId = Game.creeps[secondGatherer]?.memory?.targetId;
            // Main gatherer always has first dibs on targets (this prevents same target allocation when both gatherers look for a target at the same time)
            if (!isMainGatherer && Game.creeps[secondGatherer]?.ticksToLive && !excludeTargetId) {
                return undefined;
            }
        }

        // If there are no more targets check for any loose resources (creeps that died on the way or at mineral)
        if (!targets.length) {
            const resources = Game.rooms[roomName].find(FIND_DROPPED_RESOURCES);
            resources.forEach((resource) => targets.push({ id: resource.id, amount: resource.amount, shouldBuildRoad: false }));
        }

        // Get highest target unless a target is close by then pick that up first
        let selectedTarget: { id: Id<Resource> | Id<Structure> | Id<Tombstone>; amount: number; shouldBuildRoad?: boolean } = {
            id: undefined,
            amount: 0,
            shouldBuildRoad: false,
        };
        targets
            .filter((target) => target.id !== excludeTargetId)
            .every((target) => {
                if (this.pos.roomName === this.memory.assignment && this.pos.getRangeTo(Game.getObjectById(target.id)) <= 3) {
                    selectedTarget = target;
                    return false;
                }
                if (selectedTarget.amount < target.amount) {
                    selectedTarget = target;
                }
                return true;
            });

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

    protected damaged(): boolean {
        return this.hits < this.hitsMax * 0.85;
    }

    private hasKeeper(target: RoomPosition): boolean {
        return !!target.findInRange(FIND_HOSTILE_CREEPS, 3, { filter: (c) => c.owner.username === 'Source Keeper' }).length;
    }

    private destinationSpawningKeeper(pos: string): boolean {
        const lairId = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[this.getSourceIdByMiningPos(pos)];
        const lairInRange = Game.getObjectById(lairId) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 20;
    }

    private getSourceIdByMiningPos(pos: string): Id<Source> {
        return Object.entries(Memory.remoteData[this.memory.assignment].miningPositions).find(
            ([sourceId, miningPos]) => pos === miningPos
        )?.[0] as Id<Source>;
    }
}
