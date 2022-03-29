import { WaveCreep } from './waveCreep';

export class TransportCreep extends WaveCreep {
    public run() {
        let target: any = Game.getObjectById(this.memory.targetId);
        if (!target) {
            this.memory.targetId = this.findTarget();
            target = Game.getObjectById(this.memory.targetId);
        }

        if (target instanceof Resource) {
            this.runPickupJob(target);
        } else if (target instanceof Tombstone || target instanceof StructureContainer || target instanceof Ruin) {
            this.runCollectionJob(target);
        } else if (target instanceof StructureSpawn || target instanceof StructureExtension || target instanceof StructureTower) {
            if (this.store.energy) {
                this.runRefillJob(target);
            } else {
                this.gatherEnergy();
            }
        } else if (target instanceof StructureStorage) {
            this.storeCargo();
        }
    }

    protected findTarget(): any {
        this.say('targeting');
    }

    //gather energy to distribute
    protected gatherEnergy(): void {
        if (this.room.storage) {
            let result = this.withdraw(this.room.storage, RESOURCE_ENERGY);
            switch (result) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.room.storage, { range: 1 });
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }
        }
    }

    protected findRefillTarget(): Id<Structure> {
        let spawnStructures = this.room.find(FIND_MY_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                [STRUCTURE_EXTENSION, STRUCTURE_SPAWN].includes(structure.structureType) &&
                // @ts-ignore
                structure.store[RESOURCE_ENERGY] < structure.store.getCapacity(RESOURCE_ENERGY)
        );

        if (spawnStructures.length) {
            return this.pos.findClosestByPath(spawnStructures, { ignoreCreeps: true }).id;
        }

        let towers = this.room
            .find(FIND_MY_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_TOWER && structure.store[RESOURCE_ENERGY] < 700);
        if (towers.length) {
            return this.pos.findClosestByPath(towers, { ignoreCreeps: true }).id;
        }
    }

    protected findCollectionTarget(): Id<Resource> | Id<Structure> | Id<Tombstone> | Id<Ruin> {
        return this.room.getCollectionTarget();
    }

    //gather resources for the purpose of storing
    protected runCollectionJob(target: StructureContainer | StructureTerminal | Tombstone | Ruin): void {
        //@ts-ignore
        let resourceToWithdraw: ResourceConstant = Object.keys(target.store).shift();
        let result = this.withdraw(target, resourceToWithdraw);
        switch (result) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { range: 1 });
                break;
            case 0:
                if (Object.keys(target.store).length === 1 || target.store[resourceToWithdraw] >= this.store.getFreeCapacity()) {
                    delete this.memory.targetId;
                }
                break;
            default:
                delete this.memory.targetId;
                break;
        }
    }

    protected runPickupJob(resource: Resource): void {
        switch (this.pickup(resource)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(resource, { range: 1 });
                break;
            case 0:
            case ERR_FULL:
                delete this.memory.targetId;
        }
    }
}
