import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Transporter extends TransportCreep {
    private target: Structure | Resource | Tombstone | Ruin;
    protected runTransporterTasks() {
        if (!this.memory.task) {
            this.findNextTask();
        }
        let target = Game.getObjectById(this.memory.targetId) as any;
        if (!target && this.memory.task !== TransportCreepTask.DROPPING) {
            this.onTaskFinished();
        }
        switch (this.memory.task) {
            case TransportCreepTask.COLLECTING:
                this.debugLog('running collect task');
                this.runCollectionJob(target);
                break;
            case TransportCreepTask.PICKING_UP:
                this.debugLog('running pickup task');
                target = Game.getObjectById(this.memory.targetId);
                this.runPickupJob(target);
                break;
            case TransportCreepTask.DROPPING:
                this.debugLog('running dropoff task');
                this.runDropoff();
                break;
            case TransportCreepTask.REFILLING:
                this.debugLog('running refill task');
                target = Game.getObjectById(this.memory.targetId);
                this.runRefillJob(target);
                break;
            case TransportCreepTask.STORING:
                this.debugLog('running store task');
                target = Game.getObjectById(this.memory.targetId);
                this.storeCargo(target);
                break;
        }
    }

    protected findNextTask() {
        this.debugLog('finding next task');
        if (this.store.getFreeCapacity() > this.store.getCapacity() * 0.75) {
            let target = this.findCollectionTarget();
            if (target) {
                this.memory.targetId = target;
                if (Game.getObjectById(target) instanceof Resource) {
                    this.memory.task = TransportCreepTask.PICKING_UP;
                } else {
                    this.memory.task = TransportCreepTask.COLLECTING;
                }
                return;
            }
        }

        if (this.store.energy) {
            if (this.room.storage?.my) {
                this.debugLog('storing energy in storage');
                this.memory.targetId = this.room.storage.id;
                this.memory.task = TransportCreepTask.STORING;
                return;
            }

            let spawnToRefill = this.room.spawns.find((spawn) => spawn.store.energy < spawn.store.getCapacity(RESOURCE_ENERGY));
            if (spawnToRefill) {
                this.debugLog(`refilling spawn at ${spawnToRefill.pos.toMemSafe()}`);
                this.memory.targetId = spawnToRefill.id;
                this.memory.task = TransportCreepTask.STORING;
                return;
            }

            const centerContainerStamps = this.room.memory.stampLayout.container.filter((stamp) => stamp.type === 'center');

            let containerToRefill = centerContainerStamps
                .map((stamp) =>
                    stamp.pos
                        .toRoomPos()
                        .lookFor(LOOK_STRUCTURES)
                        .find((s: StructureContainer) => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity())
                )
                .find((s) => !!s);
            if (containerToRefill) {
                this.debugLog(`refilling container at ${containerToRefill.pos.toMemSafe()}`);
                this.memory.targetId = containerToRefill.id;
                this.memory.task = TransportCreepTask.STORING;
                return;
            }

            let managerDropPos = centerContainerStamps.find((stamp) =>
                stamp.pos.toRoomPos().findInRange(FIND_MY_CREEPS, 1, { filter: (c) => c.memory.role === Role.MANAGER })
            )?.pos;
            if (managerDropPos) {
                this.debugLog(`dropping energy at ${managerDropPos}`);
                this.memory.dropPos = managerDropPos;
                this.memory.task = TransportCreepTask.DROPPING;
                return;
            } else {
                this.memory.dropPos = centerContainerStamps.find((stamp) => stamp.rcl === 2)?.pos;
                this.debugLog(`dropping energy at ${this.memory.dropPos}`);
                this.memory.task = TransportCreepTask.DROPPING;
                return;
            }
        }

        if(this.store.getUsedCapacity()){
            if (this.room.storage?.my) {
                this.debugLog('storing cargo in storage');
                this.memory.targetId = this.room.storage.id;
                this.memory.task = TransportCreepTask.STORING;
                return;
            } 
        }
    }
}
