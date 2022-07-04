import { WaveCreep } from '../virtualCreeps/waveCreep';
import { Worker } from '../roles/worker';
import { Miner } from '../roles/miner';
import { Distributor } from '../roles/distributor';
import { Transporter } from '../roles/transporter';
import { Claimer } from '../roles/claimer';
import { Scout } from '../roles/scout';
import { Protector } from '../roles/protector';
import { GoCreep } from '../roles/goCreep';
import { Gatherer } from '../roles/gatherer';
import { Reserver } from '../roles/reserver';
import { RemoteMiner } from '../roles/remoteMiner';
import { Manager } from '../roles/manager';
import { Operative } from '../roles/operative';
import { Colonizer } from '../roles/colonizer';
import { RampartProtector } from '../roles/rampartProtector';
import { SquadAttacker } from '../roles/squadAttacker';
import { SquadHealer } from '../roles/squadHealer';
import { MineralMiner } from '../roles/mineralMiner';
import { IntershardTraveler } from '../roles/intershardTraveller';
import { Upgrader } from '../roles/upgrader';
import { SquadDismantler } from '../roles/squadDismantler';

export default function driveCreep(creep: Creep) {
    let waveCreep: WaveCreep;

    if (!creep.memory.role) {
        handleIncomingCreep(creep);
    }

    switch (creep.memory.role) {
        case Role.WORKER:
            waveCreep = new Worker(creep.id);
            break;
        case Role.MINER:
            waveCreep = new Miner(creep.id);
            break;
        case Role.DISTRIBUTOR:
            waveCreep = new Distributor(creep.id);
            break;
        case Role.REMOTE_MINER:
            waveCreep = new RemoteMiner(creep.id);
            break;
        case Role.GATHERER:
            waveCreep = new Gatherer(creep.id);
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
        case Role.PROTECTOR:
            waveCreep = new Protector(creep.id);
            break;
        case Role.GO:
            waveCreep = new GoCreep(creep.id);
            break;
        case Role.RESERVER:
            waveCreep = new Reserver(creep.id);
            break;
        case Role.MANAGER:
            waveCreep = new Manager(creep.id);
            break;
        case Role.OPERATIVE:
            waveCreep = new Operative(creep.id);
            break;
        case Role.RAMPART_PROTECTOR:
            waveCreep = new RampartProtector(creep.id);
            break;
        case Role.SQUAD_ATTACKER:
            waveCreep = new SquadAttacker(creep.id);
            break;
        case Role.SQUAD_HEALER:
            waveCreep = new SquadHealer(creep.id);
            break;
        case Role.SQUAD_DISMANTLER:
            waveCreep = new SquadDismantler(creep.id);
            break;
        case Role.MINERAL_MINER:
            waveCreep = new MineralMiner(creep.id);
            break;
        case Role.INTERSHARD_TRAVELLER:
            waveCreep = new IntershardTraveler(creep.id);
            break;
        case Role.UPGRADER:
            waveCreep = new Upgrader(creep.id);
            break;
        default:
            waveCreep = new WaveCreep(creep.id);
    }

    waveCreep.drive();
}

function handleIncomingCreep(creep: Creep) {
    let incomingCreep: OutboundCreepEntry = undefined;

    for (let i = 0; i < 4; i++) {
        let shardToCheck = 'shard' + i;
        if (Game.shard.name !== shardToCheck) {
            incomingCreep = JSON.parse(InterShardMemory.getRemote(shardToCheck))['outboundCreeps'][Game.shard.name][creep.name] ?? incomingCreep;
        }
    }

    creep.memory = incomingCreep?.memory;
}
