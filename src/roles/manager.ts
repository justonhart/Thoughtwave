import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Manager extends WaveCreep {
    public run() {
        //move managers in dumb rooms to managerpos - TODO
        if (!this.pos.isNearTo(this.room.storage)) {
            this.travelTo(this.room.storage, { range: 1 });
        } else {
            if (this.memory.targetId) {
                let target = Game.getObjectById(this.memory.targetId);

                //@ts-ignore
                this.transfer(
                    target,
                    Object.keys(this.store).reduce((most, next) => (this.store[most] > this.store[next] ? most : next), undefined)
                );
                delete this.memory.targetId;
            } else if (Object.keys(this.store).length) {
                //@ts-expect-error
                this.transfer(this.room.storage, Object.keys(this.store).pop());
            } else {
                this.startNewTask();
            }
        }
    }

    private startNewTask() {
        let structuresToManage = this.pos.findInRange(FIND_MY_STRUCTURES, 1);
        let managerLink: StructureLink = structuresToManage.find((structure) => structure.structureType === STRUCTURE_LINK)?.[0];
        let nuker: StructureNuker = structuresToManage.find((structure) => structure.structureType === STRUCTURE_NUKER)?.[0];
        let factory: StructureFactory = structuresToManage.find((structure) => structure.structureType === STRUCTURE_FACTORY)?.[0];
        //@ts-expect-error
        let spawns: StructureSpawn[] = structuresToManage.filter((structure) => structure.structureType === STRUCTURE_SPAWN);
        let powerSpawn: StructurePowerSpawn = structuresToManage.find((structure) => structure.structureType === STRUCTURE_POWER_SPAWN)?.[0];
        let terminal: StructureTerminal = structuresToManage.find((structure) => structure.structureType === STRUCTURE_TERMINAL)?.[0];

        let spawnInNeed = spawns.find((spawn) => spawn.store[RESOURCE_ENERGY] < 300);
        if (spawnInNeed) {
            this.withdraw(this.room.storage, RESOURCE_ENERGY, 300 - spawnInNeed.store[RESOURCE_ENERGY]);
            this.memory.targetId = spawnInNeed.id;
        }

        if (managerLink?.store[RESOURCE_ENERGY]) {
            this.withdraw(managerLink, RESOURCE_ENERGY);
            this.memory.targetId = this.room.storage.id;
        }
    }
}
