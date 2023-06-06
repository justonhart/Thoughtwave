import { Operative } from "./operative";

export class ReactorClaimer extends Operative {
    protected run() {
        if(this.room.name !== this.operation.targetRoom){
            this.travelToRoom(this.operation.targetRoom);
        } else {
            //@ts-ignore
            const reactor = this.room.find(FIND_REACTORS).pop();
            if((reactor as any).my){
                this.memory.recycle = true;
            }

            if(this.pos.isNearTo(reactor)){
                //@ts-ignore
                this.claimReactor(reactor);
            } else {
                this.travelTo(reactor, {range: 1});
            }
        }
    }
}