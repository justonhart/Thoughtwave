import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Operative extends WorkerCreep {
    protected run() {
        if (!this.operation) {
            this.memory.recycle = true;
            delete this.memory.operation;
            delete this.memory.destination;
        }

        switch (this.memory.operation) {
            case OperationType.STERILIZE:
                this.runSterilize();
                break;
            case OperationType.COLLECTION:
            case OperationType.POWER_BANK:
                this.runCollect();
                break;
            case OperationType.UPGRADE_BOOST:
                this.runUpgradeBoost();
                break;
            case OperationType.REMOTE_BUILD:
                this.runRemoteBuild();
                break;
            case OperationType.CLEAN:
                this.runClean();
                break;
        }
    }

    private runUpgradeBoost() {
        if (Game.rooms[this.memory.destination].controller.level < 6) {
            if (this.store.energy) {
                let controller = Game.rooms[this.memory.destination].controller;
                if (this.pos.inRangeTo(controller, 3)) {
                    this.upgradeController(controller);
                } else {
                    this.travelTo(controller, { range: 3 });
                }
            } else {
                this.gatherResourceFromOrigin(RESOURCE_ENERGY);
            }
        } else {
            this.terminateOperation();
        }
    }

    private runRemoteBuild() {
        const room = Game.rooms[this.memory.destination];
        if (this.store.energy) {
            if (room) {
                let target = Game.getObjectById(this.memory.targetId);
                if (!target) {
                    this.memory.targetId = this.findBuildTarget();
                    target = Game.getObjectById(this.memory.targetId);
                }

                if (target instanceof ConstructionSite) {
                    this.runBuildJob(target);
                } else if (target instanceof Structure) {
                    this.runRepairJob(target);
                } else {
                    this.onTaskFinished();
                    this.terminateOperation();
                }
            } else {
                this.travelToRoom(this.memory.destination);
            }
        } else {
            if (room?.energyStatus > EnergyStatus.RECOVERING) {
                this.gatherEnergy();
            } else {
                this.gatherResourceFromOrigin(RESOURCE_ENERGY);
            }
        }
    }

    private runClean() {
        if (!this.memory.targetId) {
            if (this.pos.roomName === this.memory.destination) {
                let target = this.findCleanTarget();
                if (!target) {
                    this.terminateOperation();
                } else {
                    this.memory.targetId = target;
                }
            } else {
                this.travelToRoom(this.memory.destination);
            }
        } else {
            let target = Game.getObjectById(this.memory.targetId) as Structure;
            if (target) {
                if (this.pos.isNearTo(target)) {
                    this.dismantle(target);
                } else {
                    this.travelTo(target, { range: 1 });
                }
            } else {
                this.memory.targetId = this.findCleanTarget();
            }
        }
    }

    private runSterilize() {
        if (this.travelToRoom(this.memory.destination, { range: 20 }) === IN_ROOM) {
            //@ts-expect-error
            let target: Structure = Game.getObjectById(this.memory.targetId);
            if (!target) {
                this.memory.targetId = this.findSterilizeTarget();
                target = Game.getObjectById(this.memory.targetId);
            }

            if (target) {
                this.runHardDismantleJob(target);
            } else {
                delete this.memory.targetId;
                this.terminateOperation();
            }
        }
    }

    private findSterilizeTarget(): Id<Structure> {
        let target = this.room.find(FIND_HOSTILE_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_SPAWN);
        return target?.id;
    }

    private runCollect() {
        if (this.store.getUsedCapacity()) {
            let storage = Game.rooms[this.operation.originRoom].storage;
            if (this.pos.isNearTo(storage)) {
                this.transfer(storage, Object.keys(this.store).pop() as ResourceConstant);
                if (this.operation.type === OperationType.POWER_BANK) {
                    // recycle after dropping off power
                    this.memory.recycle = true;
                }
            } else {
                this.travelTo(storage);
            }
        } else if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
            //cast target to storage for store property
            let target = Game.getObjectById(this.memory.targetId);
            if (!target) {
                this.memory.targetId = this.findCollectionTarget();
                target = Game.getObjectById(this.memory.targetId);
            }

            if (target instanceof Resource) {
                if (this.pos.isNearTo(target)) {
                    this.pickup(target);
                    delete this.memory.targetId;
                } else {
                    this.travelTo(target);
                }
            } else if (target instanceof StructureLab) {
                if (this.pos.isNearTo(target)) {
                    this.withdraw(target, target.mineralType);
                    delete this.memory.targetId;
                } else {
                    this.travelTo(target, { range: 1 });
                }
            } else if (target instanceof StructureNuker) {
                if (this.pos.isNearTo(target)) {
                    let resourceToWithdraw = target.store.G ? RESOURCE_GHODIUM : RESOURCE_ENERGY;
                    this.withdraw(target, resourceToWithdraw);
                    delete this.memory.targetId;
                } else {
                    this.travelTo(target, { range: 1 });
                }
            } else if (target instanceof StructureStorage || target instanceof StructureTerminal || target instanceof Ruin) {
                if (this.pos.isNearTo(target)) {
                    let resourceToWithdraw = this.operation.resource ?? (Object.keys(target.store)[0] as ResourceConstant);
                    this.withdraw(target, resourceToWithdraw);
                    delete this.memory.targetId;
                } else {
                    this.travelTo(target, { range: 1 });
                }
            } else if (target instanceof StructurePowerBank) {
                this.travelTo(target, { range: 4 });
            } else {
                delete this.memory.targetId;
                if (this.memory.operation !== OperationType.POWER_BANK) {
                    // Gets terminated in operationsManagement when all operatives are dead (recycled)
                    this.terminateOperation();
                } else {
                    this.memory.recycle = true;
                }
            }
        }
    }

    private findCollectionTarget(): Id<Structure> | Id<Ruin> | Id<Resource> {
        if (this.memory.operation === OperationType.POWER_BANK) {
            const powerbank = this.room.find(FIND_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_POWER_BANK })?.shift();
            if (powerbank) {
                return powerbank.id; // Go towards powerbank (easier to protect)
            }
        }

        let resource = this.room.find(FIND_DROPPED_RESOURCES, {
            filter: (r) => (this.operation.resource ? r.resourceType === this.operation.resource : true),
        });

        let bigResource = resource.filter((r) => r.amount > this.store.getFreeCapacity() / 2)?.shift();
        if (bigResource) {
            return bigResource.id;
        }

        let ruin = this.room
            .find(FIND_RUINS)
            .find(
                (r) =>
                    (r.structure.structureType === STRUCTURE_STORAGE ||
                        r.structure.structureType === STRUCTURE_TERMINAL ||
                        r.structure.structureType === STRUCTURE_POWER_BANK ||
                        r.structure.structureType === STRUCTURE_LAB ||
                        r.structure.structureType === STRUCTURE_NUKER) &&
                    r.store.getUsedCapacity()
            );
        if (ruin) {
            return ruin.id;
        }

        let structure = this.room
            .find(FIND_STRUCTURES, {
                filter: (s) =>
                    (s.structureType === STRUCTURE_STORAGE ||
                        s.structureType === STRUCTURE_TERMINAL ||
                        (s.structureType === STRUCTURE_LAB && s.mineralType && s.store[s.mineralType]) ||
                        (s.structureType === STRUCTURE_NUKER && (s.store.energy || s.store.G))) &&
                    (this.operation.resource ? s.store[this.operation.resource] : s.store.getUsedCapacity()),
            })
            .shift();

        if (structure) {
            return structure.id;
        }

        if (resource.length) {
            return resource[0].id;
        }
    }

    private findCleanTarget(): Id<Structure> {
        let destinationRoom = Game.rooms[this.memory.destination];

        let targets = destinationRoom.find(FIND_HOSTILE_STRUCTURES, {
            filter: (struct) =>
                !((struct.structureType === STRUCTURE_STORAGE || struct.structureType === STRUCTURE_TERMINAL) && struct.store.getUsedCapacity()) &&
                !(struct.structureType === STRUCTURE_LAB && struct.mineralType) &&
                !(struct.structureType === STRUCTURE_NUKER && (struct.store.energy || struct.store.G)),
        });

        return this.pos.findClosestByRange(targets)?.id;
    }

    private terminateOperation() {
        let opIndex = this.getOperationIndex();
        if (opIndex > -1) {
            Memory.operations[opIndex].stage = OperationStage.COMPLETE;
        }

        delete this.memory.destination;
        delete this.memory.operation;
    }

    private getOperationIndex() {
        return Memory.operations.findIndex((op) => op.targetRoom === this.memory.destination && op.type === this.memory.operation);
    }

    private gatherResourceFromOrigin(resource: ResourceConstant) {
        let origin = Game.rooms[this.operation.originRoom];
        if (!this.pos.isNearTo(origin.storage)) {
            this.travelTo(origin.storage);
        } else {
            this.withdraw(origin.storage, resource);
        }
    }

    private findBuildTarget(): Id<Structure> | Id<ConstructionSite> {
        const room = Game.rooms[this.memory.destination];

        let constructedDefenses = this.pos
            .findInRange(FIND_STRUCTURES, 3)
            .filter(
                (structure) => (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) && structure.hits === 1
            );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        const sites = room?.find(FIND_MY_CONSTRUCTION_SITES);
        if (sites.length) {
            return sites.reduce((mostProgressed, next) => (next.progress > mostProgressed.progress ? next : mostProgressed))?.id;
        }

        const ramparts = room?.find(FIND_MY_STRUCTURES, { filter: (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 250000 });
        if (ramparts.length) {
            return this.room.name === room.name ? this.pos.findClosestByRange(ramparts).id : ramparts.pop().id;
        }
    }
}
