import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Manager extends WaveCreep {
    public run() {
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
            } else if (this.store.getUsedCapacity() > 0) {
                //@ts-expect-error
                this.transfer(this.room.storage, Object.keys(this.store).pop());
            } else {
                this.startNewTask();
            }
        }
    }

    private startNewTask() {
        let structuresToManage = this.pos.findInRange(FIND_MY_STRUCTURES, 1);
        //@ts-expect-error
        let managerLink: StructureLink = structuresToManage.find((structure) => structure.structureType === STRUCTURE_LINK);
        //@ts-expect-error
        let nuker: StructureNuker = structuresToManage.find((structure) => structure.structureType === STRUCTURE_NUKER);
        //@ts-expect-error
        let factory: StructureFactory = structuresToManage.find((structure) => structure.structureType === STRUCTURE_FACTORY);
        //@ts-expect-error
        let spawns: StructureSpawn[] = structuresToManage.filter((structure) => structure.structureType === STRUCTURE_SPAWN);
        //@ts-expect-error
        let powerSpawn: StructurePowerSpawn = structuresToManage.find((structure) => structure.structureType === STRUCTURE_POWER_SPAWN);
        //@ts-expect-error
        let terminal: StructureTerminal = structuresToManage.find((structure) => structure.structureType === STRUCTURE_TERMINAL);

        let storage = this.room.storage;

        if (managerLink?.store[RESOURCE_ENERGY]) {
            this.withdraw(managerLink, RESOURCE_ENERGY);
            this.memory.targetId = this.room.storage.id;
            return;
        }

        let spawnInNeed = spawns.find((spawn) => spawn.store[RESOURCE_ENERGY] < 300);
        if (spawnInNeed) {
            this.withdraw(this.room.storage, RESOURCE_ENERGY, 300 - spawnInNeed.store[RESOURCE_ENERGY]);
            this.memory.targetId = spawnInNeed.id;
            return;
        }

        if (this.room.energyStatus >= EnergyStatus.STABLE && terminal?.store[RESOURCE_ENERGY] < 50000) {
            this.withdraw(storage, RESOURCE_ENERGY, Math.min(50000 - terminal?.store[RESOURCE_ENERGY], this.store.getFreeCapacity()));
            this.memory.targetId = terminal.id;
            return;
        }

        if (this.room.energyStatus < EnergyStatus.RECOVERING && terminal?.store[RESOURCE_ENERGY]) {
            this.withdraw(terminal, RESOURCE_ENERGY);
            this.memory.targetId = this.room.storage.id;
            return;
        }

        if (nuker?.store.G < 5000 && this.room.storage.store.G) {
            this.withdraw(this.room.storage, RESOURCE_GHODIUM, Math.min(5000 - nuker.store[RESOURCE_GHODIUM], this.store.getFreeCapacity()));
            this.memory.targetId = nuker.id;
            return;
        }

        if (this.room.energyStatus >= EnergyStatus.STABLE && nuker?.store.energy < 300000) {
            this.withdraw(this.room.storage, RESOURCE_ENERGY, Math.min(300000 - nuker.store[RESOURCE_ENERGY], this.store.getFreeCapacity()));
            this.memory.targetId = nuker.id;
            return;
        }
    }
}
