import { isKeeperRoom } from '../modules/data';
import { posExistsOnRoad } from '../modules/roads';
import { roomNeedsCoreStructures } from '../modules/roomDesign';
import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Gatherer extends TransportCreep {
    memory: GathererMemory;
    protected run() {
        if (this.memory.early) {
            this.runEarly();
        } else {
            this.runFull();
        }
    }

    private runEarly() {
        if (this.store.getUsedCapacity()) {
            this.dropCargoEarly();
        } else {
            if (!this.pos.isNearTo(this.getMiningPosition())) {
                this.travelTo(this.getMiningPosition(), { range: 1 });
            } else {
                let resource = this.getMiningPosition()
                    .lookFor(LOOK_RESOURCES)
                    .find((res) => res.resourceType === RESOURCE_ENERGY);
                if (resource) {
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

        if (this.damaged() || (Memory.remoteData[this.memory.assignment.toRoomPos().roomName]?.evacuate && !this.store.getUsedCapacity())) {
            delete this.memory.targetId;
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        const isSKRoom = isKeeperRoom(this.memory.assignment.split('.')[2]);
        // Return if gatherer picked up energy unless it is an SK room. In SK rooms gatherers pick up loose energy so they should check if they can pick up more energy.
        if (
            this.store.getUsedCapacity() >= 50 &&
            (this.memory._m.destination.toRoomPos().roomName === this.homeroom.name ||
                !this.store.getFreeCapacity() ||
                (Game.getObjectById(this.getContainerId()) as StructureContainer)?.store.getUsedCapacity() < 100)
        ) {
            this.runStoreProcedures();
        } else {
            const rangeToMiningPos = this.pos.getRangeTo(this.getMiningPosition());
            const rangeForResourceCheck = isSKRoom ? 5 : 1;
            this.memory.currentTaskPriority = Priority.MEDIUM;

            // Check for looseResources (ensuring it only checks once using the lastMove info)
            if (rangeToMiningPos === rangeForResourceCheck && Math.abs(this.memory._m.lastMove - Game.time) <= 1) {
                const resourceId = this.findLooseResources(rangeForResourceCheck);
                if (resourceId) {
                    this.memory.looseResourceId = resourceId;
                }
            }

            if (this.memory.looseResourceId) {
                this.runPickupLooseResource(rangeForResourceCheck);
            } else if (rangeToMiningPos <= 1) {
                const container = Game.getObjectById(this.getContainerId()) as StructureContainer;
                if (container && (container.store.getUsedCapacity() > 1000 || container.store.getUsedCapacity() >= this.store.getFreeCapacity())) {
                    const resource = Object.keys(container.store).shift() as ResourceConstant;
                    this.withdraw(container, resource);
                } else if (isSKRoom && this.keeperPresentOrSpawning()) {
                    this.avoidLairs();
                }
            } else if (isSKRoom && this.keeperPresentOrSpawning() && rangeToMiningPos <= 7) {
                this.avoidLairs();
            } else {
                this.travelTo(this.getMiningPosition(), { range: 1, useMemoryRoads: true, reusePath: 10000 });
            }
        }
    }

    private runPickupLooseResource(rangeForResourceCheck: number) {
        const looseResource = Game.getObjectById(this.memory.looseResourceId);
        if (!looseResource || (looseResource instanceof Tombstone && !looseResource.store.getUsedCapacity())) {
            delete this.memory.looseResourceId;
        } else if (this.pos.isNearTo(looseResource)) {
            let incomingAmount = 0;
            if (looseResource instanceof Tombstone) {
                const resourceType = Object.keys(looseResource.store).shift() as ResourceConstant;
                this.withdraw(looseResource, resourceType);
                incomingAmount = looseResource.store[resourceType];
            } else {
                this.pickup(looseResource);
                incomingAmount = looseResource.amount;
            }
            if (incomingAmount + this.store.getUsedCapacity() === this.store.getCapacity()) {
                delete this.memory.looseResourceId;
                this.runStoreProcedures();
            } else {
                const resourceId = this.findLooseResources(rangeForResourceCheck);
                this.memory.looseResourceId = resourceId;
            }
        } else {
            this.travelTo(looseResource, { range: 1 });
        }
    }

    // Prioritize loose resources as they decrease each tick
    private findLooseResources(rangeForResourceCheck: number) {
        const resource = this.getMiningPosition()
            .findInRange(FIND_DROPPED_RESOURCES, rangeForResourceCheck)
            ?.filter((d) => d.id !== this.memory.looseResourceId && d.amount > 100)?.[0];
        if (resource) {
            return resource.id;
        }

        const tombstone = this.getMiningPosition()
            .findInRange(FIND_TOMBSTONES, rangeForResourceCheck)
            .filter((t) => t.store.getUsedCapacity() > 100 && t.id !== this.memory.looseResourceId)?.[0];
        if (tombstone) {
            return tombstone.id;
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
        if (this.pos.isNearTo(this.homeroom.storage)) {
            let resourceToStore: any = Object.keys(this.store).shift();
            let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
            if (storeResult === OK) {
                delete Memory.rooms[this.memory.room].remoteSources[this.memory.assignment].setupStatus;
                this.manageLifecycle();
                this.travelTo(this.getMiningPosition());
            }
        } else {
            let opts = { range: 1, useMemoryRoads: true, reusePath: 10000 } as TravelToOpts;
            this.travelTo(this.homeroom.storage, opts);
        }
    }

    private dropCargoEarly() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        if (!this.memory.dropPos) {
            this.memory.dropPos = this.findDropPos();
        }
        let dropPos = this.memory.dropPos?.toRoomPos();

        if (this.pos.isEqualTo(dropPos)) {
            this.drop(RESOURCE_ENERGY);
            delete this.memory.dropPos;
            this.travelTo(this.getMiningPosition());
        } else {
            this.travelTo(dropPos);
        }
    }

    private findDropPos(): string {
        let positionsToCompare: string[] = [];
        if (!roomNeedsCoreStructures(this.homeroom) && this.homeroom.controller.level < 6) {
            const upgradeContainer = this.homeroom.memory.stampLayout.container.find((stamp) => stamp.type === STRUCTURE_CONTROLLER)?.pos;
            positionsToCompare.push(upgradeContainer);
        }
        const containerStampsAdjacentToManager = this.homeroom.memory.stampLayout.container.filter(
            (stamp) =>
                stamp.type === 'center' &&
                stamp.pos.toRoomPos().findInRange(FIND_MY_CREEPS, 1, { filter: (c) => c.memory.role === Role.MANAGER }).length
        );

        let checkPositionEnergy = (pos: string): { pos: string; energy: number } => {
            return {
                pos: pos,
                energy: pos
                    .toRoomPos()
                    .look()
                    .reduce(
                        (energySum, nextLook) =>
                            nextLook.structure?.structureType === STRUCTURE_CONTAINER
                                ? energySum + (nextLook.structure as StructureContainer).store.energy
                                : nextLook.resource?.resourceType === RESOURCE_ENERGY
                                ? energySum + nextLook.resource.amount
                                : energySum,
                        0
                    ),
            };
        };

        if (containerStampsAdjacentToManager.length) {
            positionsToCompare.push(...containerStampsAdjacentToManager.map((s) => s.pos));
        } else {
            positionsToCompare.push(...this.homeroom.memory.stampLayout.container.filter((stamp) => stamp.type === 'center').map((s) => s.pos));
        }

        return positionsToCompare
            .map((pos) => checkPositionEnergy(pos))
            .reduce((leastEnergyPos, nextPos) => (nextPos.energy < leastEnergyPos.energy ? nextPos : leastEnergyPos)).pos;
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
            delete this.memory.targetId;
        } else if (SPAWN_CYCLES_REMAINING <= 1 || TRIPS_REMAINING === 1) {
            this.memory.spawnReplacementAt = START_SPAWNING_REPLACEMENT_AT > Game.time ? START_SPAWNING_REPLACEMENT_AT : Game.time;
        }
    }

    private triggerReplacementSpawn() {
        this.homeroom.memory.remoteSources[this.memory.assignment].gatherers = this.homeroom.memory.remoteSources[
            this.memory.assignment
        ].gatherers.filter((gatherer) => gatherer !== this.name);
    }

    private getMiningPosition(): RoomPosition {
        if (!this.homeroom.memory.remoteSources[this.memory.assignment]) this.memory.recycle = true;
        return this.homeroom.memory.remoteSources[this.memory.assignment]?.miningPos.toRoomPos();
    }

    private runStoreProcedures() {
        if (
            !this.onEdge() &&
            posExistsOnRoad(this.pos, `${this.homeroom.storage.pos.toMemSafe()}:${this.getMiningPosition().toMemSafe()}`) &&
            this.getActiveBodyparts(WORK)
        ) {
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
    }
}
