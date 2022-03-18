import { WaveCreep } from "../types/WaveCreep";

export default function driveCreep(creep: Creep){
    let waveCreep = new WaveCreep(creep.id);
    waveCreep.run();
}