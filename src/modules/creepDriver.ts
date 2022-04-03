import { EarlyMaintainer } from '../roles/earlyMaintainer';
import { EarlyUpgrader } from '../roles/earlyUpgrader';
import { EarlyWorker } from '../roles/earlyWorker';
import { WaveCreep } from '../virtualCreeps/waveCreep';
import { Upgrader } from '../roles/upgrader';
import { Maintainer } from '../roles/maintainer';
import { Miner } from '../roles/miner';
import { Distributor } from '../roles/distributor';
import { Transporter } from '../roles/transporter';
import { Claimer } from '../roles/claimer';
import { Colonizer } from '../roles/colonizer';
import { Builder } from '../roles/builder';
import { EarlyBuilder } from '../roles/earlyBuilder';
import { Scout } from '../roles/scout';

export default function driveCreep(creep: Creep) {
    let waveCreep: WaveCreep;

    switch (creep.memory.role) {
        case Role.WORKER:
            waveCreep = new EarlyWorker(creep.id);
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
        case Role.BUILDER:
            if (Memory.rooms[creep.memory.room].phase === 1) {
                waveCreep = new EarlyBuilder(creep.id);
            } else {
                waveCreep = new Builder(creep.id);
            }
            break;
        case Role.MINER:
            waveCreep = new Miner(creep.id);
            break;
        case Role.DISTRIBUTOR:
            waveCreep = new Distributor(creep.id);
            break;
        case Role.TRANSPORTER:
            waveCreep = new Transporter(creep.id);
            break;
        case Role.CLAIMER:
            waveCreep = new Claimer(creep.id);
            break;
        case Role.COLONIZER:
            waveCreep = new Colonizer(creep.id);
            break;
        case Role.SCOUT:
            waveCreep = new Scout(creep.id);
            break;
        default:
            waveCreep = new WaveCreep(creep.id);
    }

    waveCreep.run();
}
