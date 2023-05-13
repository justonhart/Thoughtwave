import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Miner extends WaveCreep {
    protected run() {
        this.memory.currentTaskPriority = Priority.HIGH;
        let assignedPos = this.memory.assignment.toRoomPos();
        if (this.pos.isEqualTo(assignedPos)) {
            // Prioritize filling extensions and repairing container
            if (this.getActiveBodyparts(CARRY)) {
                const minerExtension = this.pos
                    .findInRange(FIND_MY_STRUCTURES, 1)
                    .find((structure) => structure.structureType === STRUCTURE_EXTENSION && structure.store.getFreeCapacity(RESOURCE_ENERGY));
                if (minerExtension) {
                    if (!this.store.energy) {
                        const container = this.pos
                            .lookFor(LOOK_STRUCTURES)
                            .filter((structure) => structure.structureType === STRUCTURE_CONTAINER)
                            .find((container: StructureContainer) => container.store.energy);
                        if (container) {
                            this.withdraw(container, RESOURCE_ENERGY);
                            return;
                        }
                    } else {
                        this.transfer(minerExtension, RESOURCE_ENERGY);
                        return;
                    }
                }
                if (this.store.energy) {
                    const container = this.pos
                        .lookFor(LOOK_STRUCTURES)
                        .filter((structure) => structure.structureType === STRUCTURE_CONTAINER)
                        .find((container: StructureContainer) => container.hits !== container.hitsMax);
                    if (container) {
                        this.repair(container);
                        return;
                    }
                }
            }

            this.harvest(
                this.pos
                    .findInRange(FIND_SOURCES, 1)
                    .reduce((biggestSource, sourceToCompare) => (biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare))
            );

            if (this.store.getCapacity() && !this.store.getFreeCapacity()) {
                const link: StructureLink = Game.getObjectById(this.memory.link);
                if (link) {
                    // Keep energy at miner for extensions
                    if (
                        this.pos
                            .lookFor(LOOK_STRUCTURES)
                            .filter((structure) => structure.structureType === STRUCTURE_CONTAINER)
                            .some((structure: StructureContainer) => structure.store.getFreeCapacity() > 500)
                    ) {
                        this.drop(RESOURCE_ENERGY);
                    } else {
                        // Store capacity is doubled because the creep transfer to the link also happens in the same tick and this will avoid dropping a few resources which the distributor has to pick up. Resources transfered same tick to the link will unfortunately not be send
                        if (!link?.cooldown && link?.store.getFreeCapacity(RESOURCE_ENERGY) <= 2 * this.store.getCapacity()) {
                            link.transferEnergy(this.room.managerLink);
                        }
                        this.transfer(link, RESOURCE_ENERGY);
                    }
                }
            }
        } else {
            this.travelTo(assignedPos, { maxOps: 20000, avoidHostileRooms: true });
        }
    }
}
