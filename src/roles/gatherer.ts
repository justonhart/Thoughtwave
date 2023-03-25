import { isKeeperRoom } from '../modules/data';
import { Pathing } from '../modules/pathing';
import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    protected run() {
        if (this.damaged() || Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            delete this.memory.targetId;
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
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
            // Only store Roads starting from containers
            if (target instanceof StructureContainer) {
                this.memory.storeRoadInMemory = target.id;
            }
        } else if (target instanceof StructureStorage) {
            if (this.store.energy) {
                if (this.getActiveBodyparts(WORK) && !this.roadIsServicable() && this.isOnPath()) {
                    this.workOnRoad();
                } else {
                    this.storeAndRepair();
                }
            } else {
                delete this.memory.targetId;
            }
        } else {
            delete this.memory.targetId;
        }

        // Cleanup road memory once back in homeroom
        if (this.pos.roomName === this.memory.room) {
            delete this.memory.storeRoadInMemory; // only needed to initially store road in memory
        }
    }

    private storeAndRepair(): void {
        let roomPositions = [];
        // only get roomPositions if storeRoadInMemory is set AND there isnt already a road in memory for that room or the homeroom. The homeroom is checked to avoid adding more roads when rerouting due to hostiles
        roomPositions = this.storeCargo(
            this.memory.storeRoadInMemory &&
                (!Memory.roomData[this.pos.roomName].roads || !Memory.roomData[this.pos.roomName].roads[this.memory.storeRoadInMemory]) &&
                (this.onEdge() || this.pos.isNearTo(Game.getObjectById(this.memory.storeRoadInMemory)))
        );
        // Going back to storage
        if (this.memory._m.destination?.toRoomPos()?.roomName === this.memory.room) {
            this.storeRoadInMemory(roomPositions);
        }

        this.repairRoad();
    }

    protected storeRoadInMemory(roomPositions: RoomPosition[]) {
        roomPositions
            ?.filter((pos) => pos.x < 49 && pos.y < 49 && pos.x > 0 && pos.y > 0 && this.pos.roomName === pos.roomName) // only store in memory for current room
            .forEach((pos) => {
                if (!Memory.roomData[pos.roomName].roads) {
                    Memory.roomData[pos.roomName].roads = {};
                }
                let delimiter = ',';
                // Initialize new road path
                if (!Memory.roomData[pos.roomName].roads[this.memory.storeRoadInMemory]) {
                    // only for first pos from container instead of when entering new room
                    if (!this.onEdge()) {
                        Memory.roomData[pos.roomName].roads[this.memory.storeRoadInMemory] = `${this.pos.x}:${this.pos.y}`;
                    } else {
                        delimiter = '';
                        Memory.roomData[pos.roomName].roads[this.memory.storeRoadInMemory] = '';
                    }
                }
                Memory.roomData[pos.roomName].roads[this.memory.storeRoadInMemory] += `${delimiter}${pos.x}:${pos.y}`;
            });
    }

    protected isOnPath() {
        if (this.onEdge() || !Memory.roomData[this.pos.roomName].roads) {
            return false;
        }
        return Object.values(Memory.roomData[this.pos.roomName].roads).some((path) =>
            path.split(',').some((pos) => pos === `${this.pos.x}:${this.pos.y}`)
        );
    }

    protected findTarget() {
        // Gather
        if (this.store.getUsedCapacity() < this.store.getCapacity() * 0.8) {
            return this.findCollectionTarget(this.memory.assignment);
        }

        // Hauler
        return this.homeroom.storage?.id;
    }

    protected storeCargo(retrievePathPositions?: boolean) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let resourceToStore: any = Object.keys(this.store).shift();
        let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
        let opts = { ignoreCreeps: true, range: 1, preferRoadConstruction: true } as TravelToOpts;
        if (retrievePathPositions) {
            opts.pathsRoomPositions = [];
            opts.reusePath = 0; // force reevaluation of the path
        }
        switch (storeResult) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.homeroom.storage, opts);
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
        if (!opts.pathsRoomPositions || opts.avoidedTemporaryHostileRooms || this.memory._m.repath) {
            if (opts.avoidedTemporaryHostileRooms || this.memory._m.repath) {
                delete this.memory.storeRoadInMemory; // Do not store Roads when path went around temporary hostile room
            }
            return [];
        }
        return opts.pathsRoomPositions;
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
        }
        return false;
    }

    protected findCollectionTarget(roomName?: string): Id<Resource> | Id<Structure> | Id<Tombstone> {
        const miningPositions = Memory.remoteData[roomName].miningPositions;

        const targets: { id: Id<Resource> | Id<Structure> | Id<Tombstone>; amount: number }[] = [];

        Object.values(miningPositions).forEach((posString) => {
            const pos = posString.toRoomPos();
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
                        targets.push({ id: look.resource.id, amount: look.resource.amount });
                    } else {
                        targets.push({ id: look.tombstone.id, amount: look.tombstone.store?.energy });
                    }
                });

            const container: StructureContainer = pos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;
            if (container && container.store.getUsedCapacity()) {
                targets.push({ id: container.id, amount: container.store.getUsedCapacity() });
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
            resources.forEach((resource) => targets.push({ id: resource.id, amount: resource.amount }));
        }

        // Get highest target unless a target is close by then pick that up first
        let selectedTarget: { id: Id<Resource> | Id<Structure> | Id<Tombstone>; amount: number } = {
            id: undefined,
            amount: 0,
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

        return selectedTarget?.id;
    }

    private repairRoad(): void {
        if (this.isOnPath() && this.getActiveBodyparts(WORK)) {
            const road = this.pos.lookFor(LOOK_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_ROAD);
            if (road?.hits < road?.hitsMax) {
                this.repair(road);
            }
        }
    }

    protected damaged(): boolean {
        return this.hits < this.hitsMax * 0.85;
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
