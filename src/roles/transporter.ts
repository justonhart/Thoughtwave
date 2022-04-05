import { TransportCreep } from '../virtualCreeps/transportCreep';

export class Transporter extends TransportCreep {
    protected findTarget() {
        let target: any;

        if (this.store.getFreeCapacity() > this.store.getCapacity() * 0.75) {
            target = this.findCollectionTarget();
        }

        if (!target) {
            target = this.homeroom.storage?.id;
        }

        return target;
    }
}
