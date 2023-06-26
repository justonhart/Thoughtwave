import { isKeeperRoom } from '../modules/data';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class RemoteMineralMiner extends WaveCreep {
    protected run() {
        const mineral = Game.getObjectById(this.getMineralId());

        if ((this.damaged() && !this.keeperPresentOrSpawning(mineral)) || Memory.remoteData[this.memory.assignment]?.evacuate) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        if (!this.store.getFreeCapacity()) {
            if (this.pos.isNearTo(this.homeroom.storage)) {
                let resourceToStore: any = Object.keys(this.store).shift();
                let storeResult = this.transfer(this.homeroom.storage, resourceToStore);
                if (storeResult === OK) {
                    // Recycle if mineral is gone or ttl is too low
                    this.travelToMineral(mineral);
                    if (
                        Memory.remoteData[this.memory.assignment].mineralAvailableAt > Game.time ||
                        (this.getActiveBodyparts(CARRY) * 300) / this.getActiveBodyparts(WORK) + this.memory._m.path.length * 2 > this.ticksToLive
                    ) {
                        this.memory.recycle = true;
                        return;
                    }
                }
            } else {
                this.travelTo(this.homeroom.storage, { range: 1 });
            }
        } else if (Game.rooms[this.memory.assignment]) {
            if (this.keeperPresentOrSpawning(mineral)) {
                // Always travel away from the same mineral otherwise it can cause creep to not move at all
                let closestLair: RoomPosition;
                const lairPositions = Object.entries(Memory.remoteData[this.memory.assignment].sourceKeeperLairs)
                    .filter(([sourcePos, lair]) => {
                        if (sourcePos === mineral.pos.toMemSafe()) {
                            closestLair = lair.pos.toRoomPos();
                            return false;
                        }
                        return true;
                    })
                    .map(([sourcePos, lair]) => ({ pos: lair.pos.toRoomPos(), range: 0 }));
                if (this.onEdge()) {
                    this.travelToRoom(this.memory.assignment); // Prevent going in and out of the room
                } else {
                    this.travelTo(closestLair, { range: 7, flee: true, goals: lairPositions, maxRooms: 1 }); // Travel out of harms way
                }
            } else {
                if (!this.pos.isNearTo(mineral)) {
                    this.travelToMineral(mineral);
                } else if (mineral.mineralAmount && this.store.getFreeCapacity()) {
                    this.harvest(mineral);
                } else if (mineral.mineralAmount === 0) {
                    console.log(Game.time + mineral.ticksToRegeneration);
                    Memory.remoteData[this.memory.assignment].mineralAvailableAt = Game.time + mineral.ticksToRegeneration;
                }
            }
        } else {
            this.travelToMineral(mineral);
        }
    }

    private travelToMineral(mineral: Mineral) {
        if (mineral) {
            this.travelTo(mineral.pos, { range: 1 });
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private keeperPresentOrSpawning(mineral: Mineral): boolean {
        if (!isKeeperRoom(this.memory.assignment) || !mineral) {
            return false;
        }
        const lair = Memory.remoteData[this.memory.assignment].sourceKeeperLairs[mineral.pos.toMemSafe()];
        const lairInRange = Game.getObjectById(lair?.id) as StructureKeeperLair;
        return lairInRange?.ticksToSpawn < 10 || lairInRange?.ticksToSpawn > 295 || (lairInRange && lairInRange.ticksToSpawn === undefined);
    }

    private getMineralId(): Id<Mineral> {
        if (this.memory.targetId) {
            return this.memory.targetId as Id<Mineral>;
        }

        if (Game.rooms[this.memory.assignment]) {
            let id = Game.rooms[this.memory.assignment].minerals?.pop()?.id;
            this.memory.targetId = id;
            return id;
        }
    }
}
