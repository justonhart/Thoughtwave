import { Operative } from "./operative";

export class ThoriumTransporter extends Operative{
    protected run() {
        if(!this.store.getUsedCapacity()){
            const storage = Game.rooms[this.operation.originRoom].storage;
            if(this.pos.isNearTo(storage)){
                //@ts-ignore
                this.withdraw(storage, RESOURCE_THORIUM);
            } else {
                this.travelTo(storage, {range: 1});
            }
        } else {
            const reactor = Game.getObjectById((this.operation as ThoriumOperation).reactor) as Reactor;
            if(this.pos.isNearTo(reactor)){
                //@ts-ignore
                let result = this.transfer(reactor, RESOURCE_THORIUM);
                if(result === OK){
                    this.suicide();
                }
            } else {
                this.travelTo(reactor);
            }
        }
    }
}