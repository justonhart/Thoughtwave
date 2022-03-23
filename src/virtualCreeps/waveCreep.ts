export class WaveCreep extends Creep {
    public run() {
        this.say(`Running ${this.name}`);
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage) {
        switch (this.transfer(target, RESOURCE_ENERGY)) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(target, { visualizePathStyle: { stroke: '#ffffff' } });
                break;
            case ERR_NOT_ENOUGH_RESOURCES:
                this.memory.gathering = true;
            case OK:
            case ERR_FULL:
                delete this.memory.targetId;
                break;
        }
    }

    protected storeCargo() {
        if (this.store.getUsedCapacity()) {
            let resourceToStore: any = Object.keys(this.store).shift();
            let storeResult = this.transfer(this.room.storage, resourceToStore);
            switch (storeResult) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.room.storage, { ignoreCreeps: true, range: 1 });
                    break;
                case 0:
                    break;
            }
        }
    }
}
