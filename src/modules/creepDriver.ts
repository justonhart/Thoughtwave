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
import { Protector } from '../roles/protector';
import { GoCreep } from '../roles/goCreep';
import { Gatherer } from '../roles/gatherer';
import { Reserver } from '../roles/reserver';
import { RemoteMiner } from '../roles/remoteMiner';

export default function driveCreep(creep: Creep) {
    let waveCreep: WaveCreep;

    if (!creep.memory.role) {
        handleIncomingCreep(creep);
    }

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
        default:
            waveCreep = new WaveCreep(creep.id);
    }

    waveCreep.run();
}

function handleIncomingCreep(creep: Creep) {
    let incomingCreepEntries: OutboundCreepEntry[] = [];

    switch (Game.shard.name) {
        case 'shard0': {
            let shard1Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard1'))?.outboundCreeps.shard0;
            let shard2Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard2'))?.outboundCreeps.shard0;
            let shard3Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard3'))?.outboundCreeps.shard0;

            !shard1Creeps?.[creep.name] || incomingCreepEntries.push(shard1Creeps[creep.name]);
            !shard2Creeps?.[creep.name] || incomingCreepEntries.push(shard2Creeps[creep.name]);
            !shard3Creeps?.[creep.name] || incomingCreepEntries.push(shard3Creeps[creep.name]);
        }
        case 'shard1': {
            let shard0Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard0'))?.outboundCreeps.shard1;
            let shard2Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard2'))?.outboundCreeps.shard1;
            let shard3Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard3'))?.outboundCreeps.shard1;

            !shard0Creeps?.[creep.name] || incomingCreepEntries.push(shard0Creeps[creep.name]);
            !shard2Creeps?.[creep.name] || incomingCreepEntries.push(shard2Creeps[creep.name]);
            !shard3Creeps?.[creep.name] || incomingCreepEntries.push(shard3Creeps[creep.name]);
        }
        case 'shard2': {
            let shard0Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard0'))?.outboundCreeps.shard2;
            let shard1Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard1'))?.outboundCreeps.shard2;
            let shard3Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard3'))?.outboundCreeps.shard2;

            !shard0Creeps?.[creep.name] || incomingCreepEntries.push(shard0Creeps[creep.name]);
            !shard1Creeps?.[creep.name] || incomingCreepEntries.push(shard1Creeps[creep.name]);
            !shard3Creeps?.[creep.name] || incomingCreepEntries.push(shard3Creeps[creep.name]);
        }
        case 'shard3': {
            let shard0Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard0'))?.outboundCreeps.shard3;
            let shard1Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard1'))?.outboundCreeps.shard3;
            let shard2Creeps: Map<string, OutboundCreepEntry> = JSON.parse(InterShardMemory.getRemote('shard2'))?.outboundCreeps.shard3;

            !shard0Creeps?.[creep.name] || incomingCreepEntries.push(shard0Creeps[creep.name]);
            !shard1Creeps?.[creep.name] || incomingCreepEntries.push(shard1Creeps[creep.name]);
            !shard2Creeps?.[creep.name] || incomingCreepEntries.push(shard2Creeps[creep.name]);
        }
    }

    if (incomingCreepEntries.length) {
        creep.memory = incomingCreepEntries.pop().memory;
    }
}
