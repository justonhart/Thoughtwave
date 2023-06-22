import driveCreep from './modules/creepDriver';
import { addRoomData, updateRoomData } from './modules/data';
import manageFlags from './modules/flagsManagement';
import { manageMemory } from './modules/memoryManagement';
import { addOperation, manageOperations } from './modules/operationsManagement';
import { createAndUpgradePCs, runPowerCreeps, spawnPowerCreeps } from './modules/powerCreepManagement';
import { removeSourceAssignment } from './modules/remoteMining';
import { manageEmpireResources } from './modules/resourceManagement';
import { driveRoom } from './modules/roomManagement';
import { runVisuals } from './modules/visuals';
import { WaveCreep } from './virtualCreeps/waveCreep';
require('./prototypes/requirePrototypes');

module.exports.loop = function () {
    let cpuUsed = Game.cpu.getUsed();

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

    manageOperations();

    try {
        manageFlags();
    } catch (e) {
        console.log(`Error caught in flag management: \n${e}`);
    }

    Object.values(Game.rooms).forEach((room) => {
        if (!Memory.roomData[room.name]) {
            try {
                // TODO: store powerBank: boolean in roomData
                // Check every "n" ticks for powerBank: true and not already running Operation. Then find closest room to send DUO squads out. Amount of squads should equal to open spaces around power bank. Make quadManagement not ignore allied creeps. Suitable rooms should only be lvl 8 in a 9 range distance. Get closest also store distance. Send collectors when powerbank is about to die. Amount of collectors depends on amount in bank
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

    Object.values(Game.creeps).forEach((creep) => {
        if (!creep.spawning) {
            try {
                driveCreep(creep);
            } catch (e) {
                console.log(`Error caught in creep: ${creep.name}, room: ${creep.pos.roomName}: \n${e}`);
            }
        }
    });

    try {
        manageEmpireResources();
    } catch (e) {
        console.log(`Error caught in resource management: \n${e}`);
    }

    // // Start PowerBank operations (no need to check every tick since powerspawns decay every 5000 ticks)
    // // Limited to only 3 powerbank operations at the same time initially (can be removed later)
    // if (Game.time % 99 === 0 && Object.values(Memory.operations).filter((operation) => operation.type === OperationType.POWER_BANK).length <= 3) {
    //     Object.entries(Memory.roomData)
    //         .filter(
    //             ([roomName, roomData]) =>
    //                 roomData.powerBank === true &&
    //                 Math.abs(Game.time - roomData.asOf) < 500 &&
    //                 !Object.values(Memory.operations).some(
    //                     (operation) => operation.type === OperationType.POWER_BANK && operation.targetRoom === roomName
    //                 )
    //         )
    //         .forEach(([roomName, roomData]) => {
    //             addOperation(OperationType.POWER_BANK, roomName, {
    //                 disableLogging: true,
    //                 resource: RESOURCE_POWER,
    //                 originOpts: {
    //                     minEnergyStatus: EnergyStatus.SURPLUS,
    //                     minSpawnCount: 3,
    //                     selectionCriteria: OriginCriteria.CLOSEST,
    //                     maxThreatLevel: HomeRoomThreatLevel.ENEMY_INVADERS,
    //                     maxLinearDistance: 5,
    //                     operationCriteria: { type: OperationType.POWER_BANK, maxCount: 1, stage: OperationStage.PREPARE },
    //                 },
    //             });
    //         });
    // }

    // Run PriorityQueue
    WaveCreep.getCreepsWithPriorityTask().forEach((creepName) => {
        Game.creeps[creepName].runPriorityQueueTask();
    });

    try {
        runVisuals();
    } catch (e) {
        console.log(`Error caught running visuals: \n${e}`);
    }

    Memory.cpuUsage.totalOverTime += parseInt(cpuUsed.toFixed(2));
    // Average Cpu calculated every 1500 ticks (avg creep life)
    if (Game.time % 1500 === 0) {
        Memory.cpuUsage.average = parseInt((Memory.cpuUsage.totalOverTime / 1500).toFixed(2));
        Memory.cpuUsage.totalOverTime = 0;

        // Check remote source assignments and remove the lowest if cpu is running full
        if (Memory.cpuUsage.average / Game.cpu.limit > 0.95) {
            let lowestAmount = Infinity;
            let lowestSourcePos: string;
            for (const [sourcePos, remoteAssignment] of Object.entries(Memory.remoteSourceAssignments)) {
                if (remoteAssignment.estimatedIncome < lowestAmount) {
                    lowestAmount = remoteAssignment.estimatedIncome;
                    lowestSourcePos = sourcePos;
                }
            }
            if (lowestSourcePos) {
                removeSourceAssignment(lowestSourcePos);
            }
        }
    }

    // Disable all structure notifications (rerun every 1k ticks for whenever new structures are added)
    if (Game.time % 999 === 0) {
        Object.values(Game.structures).forEach((struct) => {
            struct.notifyWhenAttacked(false);
        });
    }

    if (Game.gpl.level) {
        const powerCreeps = Object.values(Game.powerCreeps);
        createAndUpgradePCs(powerCreeps);
        spawnPowerCreeps(powerCreeps);
        runPowerCreeps(powerCreeps);
    }
};
