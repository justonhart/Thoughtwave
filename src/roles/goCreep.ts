import { WaveCreep } from '../virtualCreeps/waveCreep';

export class GoCreep extends WaveCreep {
    public run() {
        if (this.travelToRoom(Game.flags.go.pos.roomName) === IN_ROOM) {
            if (Game.flags.go && this.pos !== Game.flags.go.pos) {
                this.moveTo(Game.flags.go);
            }
        }
    }
}
