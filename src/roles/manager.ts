import { shipmentReady } from '../modules/resourceManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

const MINERAL_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)];

export class Manager extends WaveCreep {
    private actionTaken = false;

    protected run() {
        const managerPos =
            this.room.memory.layout === RoomLayout.STAMP ? this.memory.destination?.toRoomPos() : this.room.memory?.managerPos?.toRoomPos();
        const isCenterStampManager =
            this.room.memory.layout === RoomLayout.STAMP &&
            this.room.memory.stampLayout.managers.some(
                (managerDetail) => managerDetail.type === 'center' && managerDetail.pos === managerPos.toMemSafe()
            );

        if (managerPos?.isEqualTo(this.pos) === false) {
            this.travelTo(managerPos);
        } else {
            if (this.memory.targetId) {
                this.transferToTarget();
            } else if (!isCenterStampManager && this.store.getUsedCapacity() > 0 && this.room.storage?.store.getFreeCapacity()) {
                this.transfer(this.room.storage, Object.keys(this.store).pop() as ResourceConstant);
                this.actionTaken = true;
            } else if (!isCenterStampManager && this.ticksToLive > 1) {
                this.actionTaken = true;
                this.startNewTask();
            } else if (isCenterStampManager && this.ticksToLive > 1 && this.room.energyAvailable < this.room.energyCapacityAvailable) {
                this.startCenterTask();
            }

            if (!this.actionTaken && this.memory.targetId) {
                this.transferToTarget();
            }
        }
    }

    private transferToTarget() {
        let target = Game.getObjectById(this.memory.targetId) as StructureContainer;
        let resourceToTransfer = Object.keys(this.store).pop() as ResourceConstant;
        let amountTransferred = Math.min(this.store[resourceToTransfer], target.store.getFreeCapacity(resourceToTransfer));
        let result = this.transfer(target as Structure, resourceToTransfer, amountTransferred);
        if (result === OK && target instanceof StructureFactory) {
            //remove amount deposited from factoryTask need
            let needIndex = this.room.memory.factoryTask.needs?.findIndex((need) => need.resource === resourceToTransfer);
            if (needIndex !== undefined && needIndex > -1) {
                this.room.memory.factoryTask.needs[needIndex].amount -= amountTransferred;
            }
        }
        this.actionTaken = true;
        delete this.memory.targetId;
    }

    private startNewTask() {
        const structuresToManage = this.pos.findInRange(FIND_MY_STRUCTURES, 1);
        const managerLink: StructureLink = structuresToManage.find((structure) => structure.structureType === STRUCTURE_LINK) as StructureLink;
        const nuker: StructureNuker = structuresToManage.find((structure) => structure.structureType === STRUCTURE_NUKER) as StructureNuker;
        const factory: StructureFactory = structuresToManage.find((structure) => structure.structureType === STRUCTURE_FACTORY) as StructureFactory;
        const spawns: StructureSpawn[] = structuresToManage.filter((structure) => structure.structureType === STRUCTURE_SPAWN) as StructureSpawn[];
        const powerSpawn: StructurePowerSpawn = structuresToManage.find(
            (structure) => structure.structureType === STRUCTURE_POWER_SPAWN
        ) as StructurePowerSpawn;
        const terminal: StructureTerminal = structuresToManage.find(
            (structure) => structure.structureType === STRUCTURE_TERMINAL
        ) as StructureTerminal;

        const storage = this.room.storage;

        if (!storage) {
            return;
        }

        // Send energy to the center if the center link has no energy in it
        if (
            managerLink?.cooldown === 0 &&
            (storage?.store.energy || managerLink?.store.energy > 0 || terminal?.store.energy > 0) &&
            this.room.memory.layout === RoomLayout.STAMP
        ) {
            const posToCheck = this.room.memory.stampLayout.link.find((linkDetail) => linkDetail.type === 'center').pos?.toRoomPos();
            let centerLink = posToCheck?.lookFor(LOOK_STRUCTURES).find((structure) => structure.structureType === STRUCTURE_LINK) as StructureLink;
            if (centerLink) {
                if (!centerLink?.store.energy) {
                    if (managerLink?.store.energy > 0) {
                        managerLink.transferEnergy(centerLink);
                    } else {
                        this.withdraw(storage, RESOURCE_ENERGY);
                        this.memory.targetId = managerLink.id;
                        return;
                    }
                }
            }
        }

        if (!this.room.managerLink?.cooldown && this.room.upgraderLink?.store.energy <= 400 && storage.store.energy) {
            if (managerLink?.store.energy > 0) {
                managerLink.transferEnergy(this.room.upgraderLink);
            } else {
                this.withdraw(storage, RESOURCE_ENERGY);
                this.memory.targetId = managerLink.id;
                return;
            }
        }

        if (managerLink?.store[RESOURCE_ENERGY] && storage.store.getFreeCapacity()) {
            this.withdraw(managerLink, RESOURCE_ENERGY);
            this.memory.targetId = storage.id;
            return;
        }

        if (terminal) {
            let shipmentToWork = this.room.memory.shipments?.find((shipment) => !shipmentReady(terminal, shipment));
            if (shipmentToWork) {
                let result = this.workShipment(shipmentToWork);
                if (result === OK) {
                    return;
                }
            }
        }

        let spawnInNeed = spawns.find((spawn) => spawn.store[RESOURCE_ENERGY] < 300);
        if (spawnInNeed && storage.store.energy) {
            this.withdraw(storage, RESOURCE_ENERGY, Math.min(300 - spawnInNeed.store[RESOURCE_ENERGY], storage.store[RESOURCE_ENERGY]));
            this.memory.targetId = spawnInNeed.id;
            return;
        }

        if (terminal?.store[RESOURCE_ENERGY] && this.room.memory.shipments.length === 0) {
            this.withdraw(terminal, RESOURCE_ENERGY, Math.min(terminal?.store[RESOURCE_ENERGY], this.store.getFreeCapacity()));
            this.memory.targetId = storage.id;
            return;
        }

        if (nuker?.store.G < 5000 && terminal?.store.G) {
            this.withdraw(terminal, RESOURCE_GHODIUM, Math.min(5000 - nuker.store[RESOURCE_GHODIUM], terminal.store.G, this.store.getFreeCapacity()));
            this.memory.targetId = nuker.id;
            return;
        }

        if (this.room.energyStatus >= EnergyStatus.STABLE && nuker?.store.energy < 300000) {
            this.withdraw(storage, RESOURCE_ENERGY, Math.min(300000 - nuker.store[RESOURCE_ENERGY], this.store.getFreeCapacity()));
            this.memory.targetId = nuker.id;
            return;
        }

        if (factory && this.room.memory?.factoryTask && !this.room.memory.factoryTask?.started) {
            this.workFactoryTask(this.room.memory.factoryTask);
            return;
        }

        if (this.room.memory.factoryTask && factory?.store[this.room.memory.factoryTask.product]) {
            this.withdraw(factory, this.room.memory.factoryTask.product);
            this.memory.targetId = storage.id;
            return;
        }

        if (!this.room.memory?.factoryTask && factory?.store.getUsedCapacity()) {
            let res = Object.keys(factory.store).shift() as ResourceConstant;
            this.withdraw(factory, res);
            this.memory.targetId = storage.id;
            return;
        }

        let res = this.getResourceToTransferToTerminal();
        if (terminal && res) {
            this.withdraw(storage, res, Math.min(storage.store[res], 5000 - terminal?.store[res], this.store.getFreeCapacity()));
            this.memory.targetId = terminal.id;
            return;
        }

        let remRes = this.getResourceToRemoveFromTerminal();
        if (terminal && remRes) {
            let amount = MINERAL_COMPOUNDS.includes(remRes)
                ? Math.min(terminal.store[remRes] - 5000, this.store.getFreeCapacity())
                : Math.min(this.store.getFreeCapacity(), terminal?.store[remRes]);
            this.withdraw(terminal, remRes, amount);
            this.memory.targetId = storage.id;
            return;
        }

        if (storage.store.power && powerSpawn?.store.power < powerSpawn?.store.getCapacity(RESOURCE_POWER) / 10) {
            this.withdraw(
                storage,
                RESOURCE_POWER,
                Math.min(this.store.getCapacity(), storage.store.power, powerSpawn.store.getFreeCapacity(RESOURCE_POWER))
            );
            this.memory.targetId = powerSpawn.id;
            return;
        }

        if (
            this.room.energyStatus >= EnergyStatus.STABLE &&
            powerSpawn?.store.energy <= powerSpawn?.store.getCapacity(RESOURCE_ENERGY) - this.store.getCapacity()
        ) {
            this.withdraw(
                storage,
                RESOURCE_ENERGY,
                Math.min(this.store.getCapacity(), storage.store.energy, powerSpawn.store.getFreeCapacity(RESOURCE_ENERGY))
            );
            this.memory.targetId = powerSpawn.id;
            return;
        }
    }

    private startCenterTask() {
        const structuresToManage = this.pos.findInRange(FIND_STRUCTURES, 1);
        const managerLink = structuresToManage.find((structure) => structure.structureType === STRUCTURE_LINK) as StructureLink;
        const extensions = structuresToManage.filter((structure) => structure.structureType === STRUCTURE_EXTENSION) as StructureExtension[];
        const container = structuresToManage.find((structure) => structure.structureType === STRUCTURE_CONTAINER) as StructureContainer;
        const spawn = structuresToManage.find((structure) => structure.structureType === STRUCTURE_SPAWN) as StructureSpawn;

        // Pull energy from container into spawn
        if (spawn?.store.getFreeCapacity(RESOURCE_ENERGY) && (container?.store.energy || this.store.energy)) {
            if (!this.store.energy) {
                this.withdraw(container, RESOURCE_ENERGY);
                this.actionTaken = true;
            }
            this.memory.targetId = spawn.id;
            return;
        }

        // Pull energy from container into extension and ensure managers do not have the same extension as a target
        const extensionInNeed = extensions?.find(
            (extension) =>
                extension.store.getFreeCapacity(RESOURCE_ENERGY) &&
                this.room.creeps.some((creep) => creep.memory.role === Role.MANAGER && creep.memory.targetId !== extension.id)
        );
        if (extensionInNeed && (container?.store.energy || this.store.energy)) {
            if (!this.store.energy) {
                this.withdraw(container, RESOURCE_ENERGY);
                this.actionTaken = true;
            }
            this.memory.targetId = extensionInNeed.id;
            return;
        }

        // Pull energy from link into container
        if (container?.store.energy < 1600 && managerLink?.store.energy) {
            this.withdraw(managerLink, RESOURCE_ENERGY);
            this.memory.targetId = container.id;
            return;
        }
    }

    private getResourceToTransferToTerminal(): MineralCompoundConstant {
        return Object.keys(this.room.storage?.store).find(
            (res) => MINERAL_COMPOUNDS.includes(res) && this.room.terminal?.store[res] < 5000
        ) as MineralCompoundConstant;
    }

    private getResourceToRemoveFromTerminal(): ResourceConstant {
        if (this.room.terminal) {
            let resources = Object.keys(this.room.terminal.store).filter((res) => res !== RESOURCE_ENERGY);
            return resources.find(
                (res) =>
                    (MINERAL_COMPOUNDS.includes(res) ? this.room.terminal.store[res] > 5000 : true) &&
                    !this.room.memory.shipments?.some((shipmentId) => Memory.shipments[shipmentId].resource === res)
            ) as ResourceConstant;
        }
    }

    private workShipment(shipmentId: number): ScreepsReturnCode {
        const shipment = Memory.shipments[shipmentId];
        const shipmentIsMarketOrder = shipment.recipient === shipment.sender && shipment.marketOrderId;
        let result: ScreepsReturnCode;
        if (this.room.terminal.store[shipment.resource] < shipment.amount && !shipmentIsMarketOrder) {
            result = this.withdraw(
                this.room.storage,
                shipment.resource,
                Math.min(this.store.getFreeCapacity(), shipment.amount - this.room.terminal.store[shipment.resource])
            );
            if (result === OK) {
                this.memory.targetId = this.room.terminal.id;
            } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                if (Memory.debug.logShipments) {
                    console.log(
                        `Resources not found for shipment ${shipmentId} (${shipment.amount} ${shipment.resource} from ${shipment.sender} to ${shipment.recipient}). Cancelling shipment`
                    );
                }
                Memory.shipments[shipmentId].status = ShipmentStatus.FAILED;
            }
        } else {
            let energyNeeded = shipmentIsMarketOrder
                ? Game.market.calcTransactionCost(shipment.amount, shipment.recipient, Game.market.getOrderById(shipment.marketOrderId).roomName)
                : Game.market.calcTransactionCost(shipment.amount, this.room.name, shipment.recipient) +
                  (shipment.resource === RESOURCE_ENERGY ? shipment.amount : 0);
            result = this.withdraw(
                this.room.storage,
                RESOURCE_ENERGY,
                Math.min(this.store.getFreeCapacity(), energyNeeded - this.room.terminal.store.energy)
            );
            if (result === OK) {
                this.memory.targetId = this.room.terminal.id;
            } else {
                switch (result) {
                    case ERR_NOT_ENOUGH_RESOURCES:
                    case ERR_NOT_ENOUGH_ENERGY:
                        if (Memory.debug.logShipments) {
                            console.log(
                                `Resources not found for shipment ${shipmentId} (${shipment.amount} ${shipment.resource} from ${shipment.sender} to ${shipment.recipient}). Cancelling shipment`
                            );
                        }
                        Memory.shipments[shipmentId].status = ShipmentStatus.FAILED;
                        break;
                    default:
                        break;
                }
            }
        }

        return result;
    }

    private workFactoryTask(task: FactoryTask) {
        const needs = task.needs;
        const nextNeed = needs.find((need) => need.amount > 0);
        if (nextNeed) {
            const source = this.room.storage?.store[nextNeed.resource] ? this.room.storage : this.room.terminal;
            if (source) {
                this.withdraw(source, nextNeed.resource, Math.min(this.store.getFreeCapacity(), nextNeed.amount, source.store[nextNeed.resource]));
                this.memory.targetId = this.room.factory.id;
            } else {
                console.log(`${Game.time} - error finding resource for FactoryTask in ${this.room}`);
            }
        }
    }
}
