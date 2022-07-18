import { posFromMem } from '../modules/memoryManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class SuckEmDryCreep extends WaveCreep {
    protected run() {
        let assignedRoom = Game.rooms[this.memory.destination];

        if (Memory.remoteData[this.memory.destination]?.threatLevel === RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            this.travelTo(new RoomPosition(25, 25, this.memory.room), { range: 22 }); // Travel back to home room
            return;
        }

        //if we have visibility in assigned room
        if (Game.rooms[this.memory.destination]) {
            if (!this.memory.assignment) {
                this.memory.assignment = this.findNextMiningPos();
            }

            let targetPos = posFromMem(this.memory.assignment);
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
                        delete this.memory.assignment;
                    } else {
                        let source = this.pos.findInRange(FIND_SOURCES_ACTIVE, 1).shift();
                        if (source) {
                            this.harvest(source);
                        } else {
                            delete this.memory.assignment;
                        }
                    }
                }
            }
        } else {
            this.travelToRoom(this.memory.destination);
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
