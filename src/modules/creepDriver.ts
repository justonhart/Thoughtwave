import { Upgrader } from '../roles/upgrader';
import { Worker } from '../roles/worker';
import { WaveCreep } from './WaveCreep';

export default function driveCreep(creep: Creep) {
    let waveCreep: WaveCreep;

    switch (creep.memory.role) {
        case Role.WORKER:
            waveCreep = new Worker(creep.id);
            break;
        case Role.UPGRADER:
            waveCreep = new Upgrader(creep.id);
            break;
        default:
            waveCreep = new WaveCreep(creep.id);
    }

    waveCreep.run();
}
