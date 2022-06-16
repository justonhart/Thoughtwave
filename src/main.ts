import driveCreep from './modules/creepDriver';
import { manageEmpire } from './modules/empireManagement';
import manageFlags from './modules/flagsManagement';
import { manageMemory } from './modules/memoryManagement';
import { getAllRoomNeeds, manageEmpireResources } from './modules/resourceManagement';
import { driveRoom } from './modules/roomManagement';
import { WaveCreep } from './virtualCreeps/waveCreep';
require('./prototypes/requirePrototypes');

module.exports.loop = function () {
    try {
        manageMemory();
    } catch (e) {
        console.log(`Error caught in memory management: \n${e}`);
    }

    try {
        manageFlags();
    } catch (e) {
        console.log(`Error caught in flag management: \n${e}`);
    }

    //set map of all room resource needs
    global.resourceNeeds = getAllRoomNeeds();

    try {
        manageEmpire();
    } catch (e) {
        console.log(`Error caught in empire management: \n${e}`);
    }

    Object.values(Game.rooms)
        .filter((r) => r.controller?.my)
        .forEach((room) => {
            try {
                driveRoom(room);
            } catch (e) {
                console.log(`Error caught in ${room.name}: \n${e}`);
            }
        });

    Object.values(Game.creeps).forEach((creep) => {
        if (!creep.spawning) {
            try {
                driveCreep(creep);
            } catch (e) {
                console.log(`Error caught in ${creep.name}: \n${e}`);
            }
        }
    });

    try {
        manageEmpireResources();
    } catch (e) {
        console.log(`Error caught in resource management: \n${e}`);
    }

    // Run PriorityQueue
    WaveCreep.getCreepsWithPriorityTask().forEach((creepName) => {
        Game.creeps[creepName].runPriorityQueueTask();
    });

    if (Game.shard.name !== 'shard3' && Game.cpu.bucket === 10000) {
        Game.cpu.generatePixel();
    }
};
