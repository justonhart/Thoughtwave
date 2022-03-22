import { EarlyMaintainer } from '../roles/earlyMaintainer';
import { EarlyUpgrader } from '../roles/earlyUpgrader';
import { EarlyDrone } from '../roles/earlyDrone';
import { WaveCreep } from '../virtualCreeps/waveCreep';
import { Upgrader } from '../roles/upgrader';
import { Maintainer } from '../roles/maintainer';

export default function driveCreep(creep: Creep) {
    let waveCreep: WaveCreep;

    switch (creep.memory.role) {
        case Role.WORKER:
            waveCreep = new EarlyDrone(creep.id);
            break;
        case Role.UPGRADER:
            if (Memory.rooms[creep.memory.room].phase === 1) {
                waveCreep = new EarlyUpgrader(creep.id);
            } else {
                waveCreep = new Upgrader(creep.id);
            }
            break;
        case Role.MAINTAINTER:
            if (Memory.rooms[creep.memory.room].phase === 1) {
                waveCreep = new EarlyMaintainer(creep.id);
            } else {
                waveCreep = new Maintainer(creep.id);
            }
            break;
        default:
            waveCreep = new WaveCreep(creep.id);
    }

    waveCreep.run();
}
