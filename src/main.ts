import driveCreep from './modules/creepDriver';
import { addRoomData, updateRoomData } from './modules/data';
import manageFlags from './modules/flagsManagement';
import { manageMemory } from './modules/memoryManagement';
import { manageEmpireResources } from './modules/resourceManagement';
import { driveRoom } from './modules/roomManagement';
import { runVisuals } from './modules/visuals';
import { WaveCreep } from './virtualCreeps/waveCreep';
require('./prototypes/requirePrototypes');

module.exports.loop = function () {
    let cpuUsed = 0;
    let cpuUsageString = `${Game.time}:   `;

    try {
        if (global.nextTickFunctions?.length) {
            global.nextTickFunctions.forEach((taskName) => taskName());
            global.nextTickFunctions = [];
        }
    } catch (e) {
        global.nextTickFunctions.pop();
        console.log(`Error caught in nextTickFunctions: \n${e}`);
    }

    try {
        manageMemory();
    } catch (e) {
        console.log(`Error caught in memory management: \n${e}`);
    }

    cpuUsageString += `memory CPU: ${(Game.cpu.getUsed() - cpuUsed).toFixed(2)}     `;
    cpuUsed = Game.cpu.getUsed();

    try {
        manageFlags();
    } catch (e) {
        console.log(`Error caught in flag management: \n${e}`);
    }

    Object.values(Game.rooms).forEach((room) => {
        if (!Memory.roomData[room.name]) {
            try {
                addRoomData(room);
            } catch (e) {
                console.log(`Error caught adding data for ${room.name}: \n${e}`);
            }
        } else {
            updateRoomData(room);
        }

        if (room.controller?.my) {
            try {
                driveRoom(room);
            } catch (e) {
                console.log(`Error caught in ${room.name}: \n${e}`);
            }
        }
    });

    cpuUsageString += `rooms CPU: ${(Game.cpu.getUsed() - cpuUsed).toFixed(2)}     `;
    cpuUsed = Game.cpu.getUsed();

    Object.values(Game.creeps).forEach((creep) => {
        if (!creep.spawning) {
            try {
                driveCreep(creep);
            } catch (e) {
                console.log(`Error caught in creep: ${creep.name}, room: ${creep.pos.roomName}: \n${e}`);
            }
        }
    });

    cpuUsageString += `creeps CPU: ${(Game.cpu.getUsed() - cpuUsed).toFixed(2)}     `;
    cpuUsed = Game.cpu.getUsed();

    try {
        manageEmpireResources();
    } catch (e) {
        console.log(`Error caught in resource management: \n${e}`);
    }

    cpuUsageString += `resource cpu: ${(Game.cpu.getUsed() - cpuUsed).toFixed(2)}     `;
    cpuUsed = Game.cpu.getUsed();

    // Run PriorityQueue
    WaveCreep.getCreepsWithPriorityTask().forEach((creepName) => {
        Game.creeps[creepName].runPriorityQueueTask();
    });

    try {
        runVisuals();
    } catch (e) {
        console.log(`Error caught running visuals: \n${e}`);
    }

    cpuUsageString += `visuals cpu: ${(Game.cpu.getUsed() - cpuUsed).toFixed(2)}     `;
    cpuUsed = Game.cpu.getUsed();

    if (Memory.debug?.logCpu) {
        console.log(cpuUsageString + `total: ${Game.cpu.getUsed().toFixed(2)}`);
    }

    if (Game.cpu.bucket === 10000) {
        Game.cpu.generatePixel();
    }
};
