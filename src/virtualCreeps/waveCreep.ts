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
            if (!this.room.labs.length) {
                delete this.memory.needsBoosted;
            } else {
                this.getNextBoost();
            }
        } else if (this.memory.waypoints?.[0]) {
            let portalPos = this.memory.waypoints[0].toRoomPos();

            if (!this.pos.isNearTo(portalPos)) {
                this.travelTo(portalPos);
            } else {
                let portalStructure: StructurePortal = portalPos
                    .lookFor(LOOK_STRUCTURES)
                    .find((struct) => struct.structureType === STRUCTURE_PORTAL) as StructurePortal;

                this.memory.waypoints = this.memory.waypoints.filter((pos) => pos !== this.memory.waypoints[0]);

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

    public static deletePriorityQueueTask(creepName: string) {
        WaveCreep.priorityQueue.delete(creepName);
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
        let nextBoostTask = Object.values(this.room.memory.labTasks).find((task) => task.targetCreepName === this.name);
        if (nextBoostTask) {
            let boostLab = Game.getObjectById(nextBoostTask.reactionLabs?.[0]);
            if (boostLab && nextBoostTask.status === TaskStatus.ACTIVE) {
                this.memory.currentTaskPriority = Priority.MEDIUM;
                this.travelTo(boostLab, { range: 1 });
            } else {
                this.memory.currentTaskPriority = Priority.LOW;
            }
        } else {
            delete this.memory.needsBoosted;
            delete this.memory.currentTaskPriority;
        }
    }

    /**
     * Uses targetId2 due to many creeps using targetId for other operations and it then causing them to execute a different operation.
     * Unlike recycle it will not take priority over all other operations so it is not implemented on waveCreep level.
     */
    protected renewCreep() {
        if (this.travelToRoom(this.homeroom.name) === IN_ROOM && !this.memory.targetId2) {
            this.memory.targetId2 = this.homeroom.mySpawns?.filter((spawn) => !spawn.spawning).shift()?.id;
        }

        const target = Game.getObjectById(this.memory.targetId2) as StructureSpawn;
        if (target instanceof StructureSpawn) {
            if (this.pos.isNearTo(target)) {
                // Creep can not yet get renewed - move close to the spawn an wait
                if (this.ticksToLive >= 1500 - Math.floor(600 / this.body.length)) {
                    return;
                }
                const result = target.renewCreep(this);
                // Spawner started spawning so find different one
                if (result !== OK) {
                    delete this.memory.targetId2;
                }
            } else {
                this.travelTo(target, { range: 1 });
            }
        } else {
            delete this.memory.targetId2;
        }
    }

    protected recycleCreep() {
        this.memory.currentTaskPriority = Priority.HIGH; // Be able to move creeps off container
        let target = Game.getObjectById(this.memory.targetId) as StructureSpawn | StructureContainer;
        if (!target || target.pos.roomName !== this.homeroom.name || !(target instanceof StructureSpawn || target instanceof StructureContainer)) {
            this.memory.targetId = this.homeroom.structures.find(
                (s) => s.structureType === STRUCTURE_CONTAINER && this.homeroom.mySpawns.some((spawn) => s.pos.isNearTo(spawn))
            )?.id;

            if (!this.memory.targetId) {
                this.memory.targetId = this.homeroom.mySpawns?.shift()?.id;
            }
            target = Game.getObjectById(this.memory.targetId) as StructureSpawn | StructureContainer;
        }

        if (target instanceof StructureContainer) {
            if (this.pos.isEqualTo(target)) {
                this.homeroom.mySpawns.find((s) => this.pos.isNearTo(s))?.recycleCreep(this);
            } else {
                this.travelTo(target);
            }
        } else if (target instanceof StructureSpawn) {
            if (this.pos.isNearTo(target)) {
                target.recycleCreep(this);
            } else {
                this.travelTo(target, { range: 1 });
            }
        } else {
            delete this.memory.targetId;
        }
    }

    protected damaged() {
        return this.hits < this.hitsMax;
    }
}
