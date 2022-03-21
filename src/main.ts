import driveCreep from './modules/creepDriver';
import { manageMemory } from './modules/memoryManagement';
import { populationControl } from './modules/populationControl';
import driveRoom from './modules/roomDriver';
require('./prototypes/requirePrototypes');

module.exports.loop = function () {
    Object.values(Game.spawns).forEach((spawn) => {
        if (!spawn.spawning) {
            try {
                populationControl(spawn);
            } catch (e) {
                console.log(`Error caught in ${spawn.name}: \n${e}`);
            }
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

    Object.values(Game.rooms).forEach((room) => {
        try {
            driveRoom(room);
        } catch (e) {
            console.log(`Error caught in ${room.name}: \n${e}`);
        }
    });

    try {
        manageMemory();
    } catch (e) {
        console.log(`Error caught in memory management: \n${e}`);
    }

    if (Game.cpu.bucket === 10000) {
        Game.cpu.generatePixel();
    }
};
