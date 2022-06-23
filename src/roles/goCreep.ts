import { WaveCreep } from '../virtualCreeps/waveCreep';

export class GoCreep extends WaveCreep {
    protected run() {
        if (Game.flags.go && this.pos !== Game.flags.go.pos) {
            if (this.pos.isNearTo(Game.flags.go) && Game.flags.go.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_PORTAL)) {
                let portal: any = Game.flags.go.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_PORTAL);

                if (portal.destination.shard) {
                    this.enterInterShardPortal(portal);
                } else {
                    this.moveTo(Game.flags.go);
                }
            } else {
                this.travelTo(Game.flags.go);
            }
        }
    }
}
