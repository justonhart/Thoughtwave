import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Manager extends WaveCreep {
    protected run() {
        if (posFromMem(this.room.memory?.managerPos)?.isEqualTo(this.pos) === false) {
            this.travelTo(posFromMem(this.room.memory?.managerPos));
        } else {
            if (this.memory.targetId) {
                let target = Game.getObjectById(this.memory.targetId);

                this.transfer(
                    //@ts-ignore
                    target,
                    Object.keys(this.store).pop()
                );
                delete this.memory.targetId;
            } else if (this.store.getUsedCapacity() > 0 && this.room.storage?.store.getFreeCapacity()) {
                //@ts-expect-error
                this.transfer(this.room.storage, Object.keys(this.store).pop());
            } else {
                this.startNewTask();
            }
        }
    }

    private startNewTask() {
        let structuresToManage = this.pos.findInRange(FIND_MY_STRUCTURES, 1);
        let managerLink: StructureLink = structuresToManage.find((structure) => structure.structureType === STRUCTURE_LINK) as StructureLink;
        let nuker: StructureNuker = structuresToManage.find((structure) => structure.structureType === STRUCTURE_NUKER) as StructureNuker;
        let factory: StructureFactory = structuresToManage.find((structure) => structure.structureType === STRUCTURE_FACTORY) as StructureFactory;
        let spawns: StructureSpawn[] = structuresToManage.filter((structure) => structure.structureType === STRUCTURE_SPAWN) as StructureSpawn[];
        let powerSpawn: StructurePowerSpawn = structuresToManage.find(
            (structure) => structure.structureType === STRUCTURE_POWER_SPAWN
        ) as StructurePowerSpawn;
        let terminal: StructureTerminal = structuresToManage.find((structure) => structure.structureType === STRUCTURE_TERMINAL) as StructureTerminal;

        let storage = this.room.storage;

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

        let spawnInNeed = spawns.find((spawn) => spawn.store[RESOURCE_ENERGY] < 300);
        if (spawnInNeed && storage.store.energy) {
            this.withdraw(storage, RESOURCE_ENERGY, 300 - spawnInNeed.store[RESOURCE_ENERGY]);
            this.memory.targetId = spawnInNeed.id;
            return;
        }

        if (this.room.energyStatus >= EnergyStatus.STABLE && terminal?.store[RESOURCE_ENERGY] < 50000) {
            this.withdraw(storage, RESOURCE_ENERGY, Math.min(50000 - terminal?.store[RESOURCE_ENERGY], this.store.getFreeCapacity()));
            this.memory.targetId = terminal.id;
            return;
        }

        if (terminal?.store[RESOURCE_ENERGY] > 50000) {
            this.withdraw(terminal, RESOURCE_ENERGY, Math.min(terminal?.store[RESOURCE_ENERGY] - 50000, this.store.getFreeCapacity()));
            this.memory.targetId = storage.id;
            return;
        }

        if (nuker?.store.G < 5000 && terminal?.store.G) {
            this.withdraw(terminal, RESOURCE_GHODIUM, Math.min(5000 - nuker.store[RESOURCE_GHODIUM], this.store.getFreeCapacity()));
            this.memory.targetId = nuker.id;
            return;
        }

        if (this.room.energyStatus >= EnergyStatus.STABLE && nuker?.store.energy < 300000) {
            this.withdraw(storage, RESOURCE_ENERGY, Math.min(300000 - nuker.store[RESOURCE_ENERGY], this.store.getFreeCapacity()));
            this.memory.targetId = nuker.id;
            return;
        }

        if (this.getResourceToMove()) {
            let res = this.getResourceToMove();
            this.withdraw(storage, res, Math.min(storage.store[res], 5000 - terminal.store[res], this.store.getFreeCapacity()));
            this.memory.targetId = terminal.id;
            return;
        }

        if (terminal?.store.getFreeCapacity() && storage.store.energy < storage.store.getUsedCapacity()) {
            let resourceToWithdraw = Object.keys(storage.store)
                .filter((res) => res !== RESOURCE_ENERGY && terminal.store[res] < 5000)
                .shift();
            this.withdraw(storage, resourceToWithdraw as ResourceConstant);
            this.memory.targetId = terminal.id;
        }
    }

    private getResourceToMove(): MineralCompoundConstant {
        return Object.keys(this.room.storage?.store).find(
            (res) => this.room.storage.store[res] && this.room.terminal?.store[res] < 5000
        ) as MineralCompoundConstant;
    }
}
