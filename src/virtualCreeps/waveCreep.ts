import { posFromMem } from '../modules/memoryManagement';

export class WaveCreep extends Creep {
    private static priorityQueue: Map<string, (creep: Creep) => void> = new Map();

    public drive() {
        if (this.memory.portalLocations?.[0]) {
            let portal = posFromMem(this.memory.portalLocations[0]);

            if (!this.pos.isNearTo(portal)) {
                this.travelTo(portal);
            } else {
                this.moveTo(portal);
                this.memory.portalLocations.shift();
            }
        } else {
            this.run();
        }
    }

    protected run() {
        this.say(`Running ${this.name}`);
    }

    protected runRefillJob(target: StructureSpawn | StructureExtension | StructureTower | StructureStorage) {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        if (target.store.getFreeCapacity(RESOURCE_ENERGY)) {
            switch (this.transfer(target, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { range: 1 });
                    break;
                case ERR_NOT_ENOUGH_RESOURCES:
                    this.memory.gathering = true;
                case OK:
                case ERR_FULL:
                    this.onTaskFinished();
                    break;
            }
        } else {
            this.onTaskFinished();
        }
    }

    protected storeCargo() {
        this.memory.currentTaskPriority = Priority.MEDIUM;
        let resourceToStore: any = Object.keys(this.store).shift();
        let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
        switch (storeResult) {
            case ERR_NOT_IN_RANGE:
                this.travelTo(this.homeroom.storage, { ignoreCreeps: true, range: 1 });
                break;
            case 0:
                if (this.store[resourceToStore] === this.store.getUsedCapacity()) {
                    this.onTaskFinished();
                }
                break;
            case ERR_FULL:
            default:
                this.onTaskFinished();
                break;
        }
    }

    protected onTaskFinished(): void {
        this.memory.currentTaskPriority = Priority.LOW;
        delete this.memory.targetId;
    }

    /**
     * Add a task to the priority queue as long as the priority is equalTo or higher than the current task.
     * @param  creep                        -
     * @param  priority                     priority of the actionCallback
     * @param  actionCallback               function to be executed (build, harvest, travelTo, etc.)
     * @return                -
     */
    public static addToPriorityQueue(creep: Creep, priority: Priority, actionCallback: (creep: Creep) => void) {
        const currentTaskPriority = creep.memory.currentTaskPriority ?? Priority.LOW;
        if (priority > currentTaskPriority) {
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

    public enterInterShardPortal(portal: StructurePortal) {
        //@ts-expect-error
        console.log(`${this.name} is going to ${portal.destination.shard}! Safe travels!`);

        this.moveTo(portal);

        //add creep memory to intershard outgoing creeps
        let intershardMem: EmpireIntershard = JSON.parse(InterShardMemory.getLocal());

        //@ts-expect-error
        intershardMem.outboundCreeps[portal.destination.shard][this.name] = {
            memory: this.memory,
            expirationTime: Game.time + 10,
        };

        InterShardMemory.setLocal(JSON.stringify(intershardMem));

        //remove creep memory from shard memory
        delete Memory.creeps[this.name];
    }
}
