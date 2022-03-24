import { posFromMem } from '../modules/memoryManagement';
import { WorkerCreep } from './workerCreep';

export class EarlyCreep extends WorkerCreep {
    protected gatherEnergy() {
        if (this.memory.miningPos && this.store[RESOURCE_ENERGY] === this.store.getCapacity()) {
            this.releaseSourceAccessPoint();
            this.memory.gathering = false;
            return;
        }

        if (this.room.storage?.my === false && this.room.storage.store[RESOURCE_ENERGY]) {
            switch (this.withdraw(this.room.storage, RESOURCE_ENERGY)) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(this.room.storage);
                    break;
                case 0:
                    this.memory.gathering = false;
                    break;
            }
        } else {
            if (!this.memory.miningPos) {
                this.claimSourceAccessPoint();
            }

            let miningPos = posFromMem(this.memory.miningPos);
            if (miningPos) {
                if (this.pos.isEqualTo(miningPos)) {
                    //find the source in mining range w/ the highest energy and harvest from it - this matters for mining positions adjacent to more than one source
                    let highestSourceInRange = this.pos
                        .findInRange(FIND_SOURCES, 1)
                        .reduce((biggestSource, sourceToCompare) =>
                            biggestSource.energy > sourceToCompare.energy ? biggestSource : sourceToCompare
                        );
                    let miningResult = this.harvest(highestSourceInRange);

                    if ((miningResult === OK && this.isEnergyHarvestingFinished()) || miningResult === ERR_NOT_ENOUGH_RESOURCES) {
                        this.memory.gathering = false;
                        this.releaseSourceAccessPoint();
                    }
                } else {
                    this.travelTo(miningPos);
                }
            }
        }
    }

    private claimSourceAccessPoint() {
        if (this.room.memory.availableSourceAccessPoints.length) {
            let accessPoints = this.room.memory.availableSourceAccessPoints.map((posString) => posFromMem(posString));
            let activeSources = this.room.find(FIND_SOURCES_ACTIVE);
            let activeAccessPoints = new Set<RoomPosition>();
            accessPoints.forEach((pos) => {
                activeSources.forEach((sourcePos) => {
                    if (pos.isNearTo(sourcePos)) {
                        activeAccessPoints.add(pos);
                    }
                });
            });

            let closest = this.pos.findClosestByPath(Array.from(activeAccessPoints), { ignoreCreeps: true });
            if (closest) {
                this.memory.miningPos = closest.toMemSafe();
                let index = accessPoints.findIndex((pos) => pos.isEqualTo(closest));
                this.room.memory.availableSourceAccessPoints.splice(index, 1).shift();
                return OK;
            }
        }

        return ERR_NOT_FOUND;
    }

    private releaseSourceAccessPoint() {
        this.room.memory.availableSourceAccessPoints.push(this.memory.miningPos);
        delete this.memory.miningPos;
    }

    private isEnergyHarvestingFinished(): boolean {
        let harvestedAmount = this.getActiveBodyparts(WORK) * 2;
        return harvestedAmount >= this.store.getFreeCapacity(RESOURCE_ENERGY);
    }

    protected runFillStorage() {
        if (this.store.getUsedCapacity() === 0) {
            this.memory.gathering = true;
        }

        if (this.memory.gathering) {
            this.gatherEnergy();
        } else {
            this.storeCargo();
        }
    }
}
