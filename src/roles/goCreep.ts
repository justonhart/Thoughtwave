import { WaveCreep } from '../virtualCreeps/waveCreep';

export class GoCreep extends WaveCreep {
    protected run() {
        if (this.travelToRoom(Game.flags.go.pos.roomName) === IN_ROOM) {
            if (Game.flags.go && this.pos !== Game.flags.go.pos) {
                if (
                    this.pos.isNearTo(Game.flags.go) &&
                    Game.flags.go.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_PORTAL)
                ) {
                    //@ts-expect-error
                    let portal: StructurePortal = Game.flags.go.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_PORTAL);

                    //@ts-expect-error
                    if (portal.destination.shard) {
                        this.enterInterShardPortal(portal);
                    } else {
                        this.moveTo(Game.flags.go);
                    }
                } else {
                    this.moveTo(Game.flags.go);
                }
            }
        }
    }
}
