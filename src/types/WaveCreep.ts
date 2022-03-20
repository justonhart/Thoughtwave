import { posFromMem } from "../modules/memoryManagement";

export class WaveCreep extends Creep{
    public run(){
        this.say(`Running ${this.name}`);
    }

    private claimSourceAccessPoint() {
        if(this.room.memory.availableSourceAccessPoints.length){
            let accessPoints = this.room.memory.availableSourceAccessPoints.map(s => posFromMem(s));
            let closest = this.pos.findClosestByPath(accessPoints);
            this.memory.miningPos = closest.toMemSafe();

            let index = accessPoints.findIndex(pos => pos.isEqualTo(closest));
            this.room.memory.availableSourceAccessPoints.splice(index, 1).shift();
        }
        else{
            return -1;
        }
    }

    private releaseSourceAccessPoint(){
        console.log(this.room.memory.availableSourceAccessPoints.push(this.memory.miningPos));
        delete this.memory.miningPos;
    }

    //this assumes the creeps will have WORK parts - different creep subtypes may be necessary
    protected gatherEnergy(){

        if(this.store[RESOURCE_ENERGY] === this.store.getCapacity()){
            this.releaseSourceAccessPoint();
            this.memory.gathering = false;
            return;
        }

        if(!this.memory.miningPos){
            this.claimSourceAccessPoint();
        }
        
        else{
            let miningPos = posFromMem(this.memory.miningPos);
            if(this.pos.isEqualTo(miningPos)){

                //find the source in mining range w/ the highest energy and harvest from it - this matters for mining positions adjacent to more than one source
                let sourcesInRange = this.pos.findInRange(FIND_SOURCES, 1).sort((a,b) => b.energy - a.energy);
                let miningResult = this.harvest(sourcesInRange.shift());

                //if a source is out of energy, get back to work
                if(miningResult === ERR_NOT_ENOUGH_RESOURCES && this.store[RESOURCE_ENERGY] > 0){
                    this.memory.gathering = false;
                    this.releaseSourceAccessPoint();
                }
            }
            else{
                this.moveTo(miningPos);
            }
        }
    }
}