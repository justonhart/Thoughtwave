import { timeStamp } from 'console';

export class WaveCreep extends Creep {
    private static priorityQueue: Map<string, (creep: Creep) => void> = new Map();

    public run() {
        this.say(`Running ${this.name}`);
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage) {
        if (target.store.getFreeCapacity(RESOURCE_ENERGY)) {
            switch (this.transfer(target, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { range: 1, visualizePathStyle: { stroke: '#ffffff' } });
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    this.memory.gathering = true;
                case OK:
                case ERR_FULL:
                    this.memory.currentTaskPriority = Priority.MEDIUM;
                    delete this.memory.targetId;
                    break;
            }
        } else {
            this.memory.currentTaskPriority = Priority.MEDIUM;
            delete this.memory.targetId;
        }
    }

    protected storeCargo() {
        let resourceToStore: any = Object.keys(this.store).shift();
        let storeResult = this.transfer(this.room.storage, resourceToStore);
        switch (storeResult) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.room.storage, { ignoreCreeps: true, range: 1 });
                break;
            case 0:
                if (this.store[resourceToStore] === this.store.getUsedCapacity()) {
                    delete this.memory.targetId;
                }
                break;
            default:
                delete this.memory.targetId;
                break;
        }
    }

    /**
     * Add a task to the priority queue as long as the priority is equalTo or higher than the current task.
     * @param  creep                        -
     * @param  priority                     priority of the actionCallback
     * @param  actionCallback               function to be executed (build, harvest, travelTo, etc.)
     * @return                -
     */
    public static addToPriorityQueue(creep: Creep, priority: Priority, actionCallback: (creep: Creep) => void) {
        const currentTaskPriority = creep.memory.currentTaskPriority;
        if (currentTaskPriority && priority >= currentTaskPriority) {
            creep.memory.currentTaskPriority = priority; // Set new priority
            WaveCreep.priorityQueue.set(creep.name, actionCallback);
        }
    }

    public static runPriorityQueueTask(creep: Creep) {
        WaveCreep.priorityQueue.get(creep.name)(creep);
        WaveCreep.priorityQueue.delete(creep.name);
    }

    public static getCreepsWithPriorityTask(): string[] {
        return Array.from(WaveCreep.priorityQueue.keys());
    }
}
