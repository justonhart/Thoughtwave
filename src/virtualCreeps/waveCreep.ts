import { posFromMem } from '../modules/data';

export class WaveCreep extends Creep {
    private static priorityQueue: Map<string, (creep: Creep) => void> = new Map();
    public drive() {
        //disable notifications for all creeps
        this.notifyWhenAttacked(false);

        // recycle creep
        if (this.memory.recycle) {
            this.recycleCreep();
            return;
        }

        if (this.memory.needsBoosted) {
            this.getNextBoost();
        } else if (this.memory.portalLocations?.[0]) {
            let portalPos = posFromMem(this.memory.portalLocations[0]);

            if (!this.pos.isNearTo(portalPos)) {
                this.travelTo(portalPos);
            } else {
                let portalStructure: StructurePortal = portalPos
                    .lookFor(LOOK_STRUCTURES)
                    .find((struct) => struct.structureType === STRUCTURE_PORTAL) as StructurePortal;

                this.memory.portalLocations = this.memory.portalLocations.filter((pos) => pos !== this.memory.portalLocations[0]);

                if (portalStructure.destination instanceof RoomPosition) {
                    this.moveTo(portalPos);
                } else {
                    this.enterInterShardPortal(portalStructure);
                }
            }
        } else {
            this.run();
        }
    }

    protected run() {
        this.say(`Running ${this.name}`);
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
        delete this.memory.currentTaskPriority;
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

    protected enterInterShardPortal(portal: StructurePortal) {
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

    private getNextBoost() {
        let nextBoostTask = this.room.memory.labTasks.find((task) => task.targetCreepName === this.name);
        if (nextBoostTask) {
            let boostLab = Game.getObjectById(nextBoostTask.reactionLabs?.[0]);
            if (boostLab && nextBoostTask.status === TaskStatus.ACTIVE) {
                this.memory.currentTaskPriority = Priority.HIGH;
                this.travelTo(boostLab, { range: 1 });
            } else {
                this.memory.currentTaskPriority = Priority.LOW;
            }
        } else {
            delete this.memory.needsBoosted;
            delete this.memory.currentTaskPriority;
        }
    }

    private recycleCreep() {
        if (this.travelToRoom(this.homeroom.name) === IN_ROOM) {
            const availableSpawns = this.homeroom.find(FIND_MY_SPAWNS).filter((spawn) => !spawn.spawning);
            if (availableSpawns.length) {
                if (this.pos.isNearTo(availableSpawns[0])) {
                    availableSpawns[0].recycleCreep(this);
                } else if (this.homeroom.memory.layout === RoomLayout.STAMP) {
                    this.travelTo(
                        this.homeroom.stamps.container.find(
                            (containerStamp) => containerStamp.type === 'center' && availableSpawns[0].pos.isNearTo(containerStamp.pos)
                        ).pos
                    );
                } else {
                    this.travelTo(availableSpawns[0], { range: 1 });
                }
            }
        }
    }

    protected damaged() {
        return this.hits < this.hitsMax;
    }
}
