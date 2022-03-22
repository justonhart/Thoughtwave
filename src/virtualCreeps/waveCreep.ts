export class WaveCreep extends Creep {
    public run() {
        this.say(`Running ${this.name}`);
    }

    protected runStoreJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage) {
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
}
