import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';
export class RemoteMiner extends WaveCreep {
    protected run() {
        if (Memory.remoteData[this.memory.assignment]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.memory.assignment]) {
            if (!this.memory.destination) {
                this.memory.destination = this.findNextMiningPos();
            }

            let targetPos = posFromMem(this.memory.destination);
            if (targetPos) {
                if (!this.pos.isEqualTo(targetPos)) {
                    this.travelTo(targetPos);
                } else {
                    let container: StructureContainer = targetPos
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;

                    if (!container) {
                        let constructionSite = targetPos.lookFor(LOOK_CONSTRUCTION_SITES).find((s) => s.structureType === STRUCTURE_CONTAINER);
                        if (!constructionSite) {
                            this.room.createConstructionSite(targetPos, STRUCTURE_CONTAINER);
                        } else if (this.store.energy) {
                            this.build(constructionSite);
                            return;
                        }
                    } else if (this.store.energy && container.hits < container.hitsMax) {
                        this.repair(container);
                    } else if (!container.store.getFreeCapacity()) {
                        delete this.memory.destination;
                    } else {
                        let source = this.pos.findInRange(FIND_SOURCES_ACTIVE, 1).shift();
                        if (source) {
                            this.harvest(source);
                        } else {
                            delete this.memory.destination;
                        }
                    }
                }
            } else {
                if (Memory.remoteData[this.memory.assignment].gatherer) {
                    this.say(`🚚 is SLOW!`);
                }
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findNextMiningPos(): string {
        let nextPos = Memory.remoteData[this.memory.assignment]?.miningPositions?.find((posString) => {
            let pos = posFromMem(posString);
            let source = pos.findInRange(FIND_SOURCES_ACTIVE, 1).shift();
            let container: StructureContainer = pos
                .lookFor(LOOK_STRUCTURES)
                .find((s) => s.structureType === STRUCTURE_CONTAINER) as StructureContainer;

            return !!source && !(container?.store.getFreeCapacity() === 0);
        });

        return nextPos;
    }
}
