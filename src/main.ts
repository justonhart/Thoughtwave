import driveCreep from './modules/creepDriver';
import { manageMemory } from './modules/memoryManagement';
import populationControl from './modules/populationControl';
import driveRoom from './modules/roomDriver';
require('./prototypes/requirePrototypes');

module.exports.loop = function () {
    Object.values(Game.spawns).forEach((spawn) => {
        if (!spawn.spawning) {
            populationControl(spawn);
        }
    });

    Object.values(Game.creeps).forEach((creep) => {
        if (!creep.spawning) {
            driveCreep(creep);
        }
    });

    Object.values(Game.rooms).forEach((room) => {
        driveRoom(room);
    });

    manageMemory();
};
