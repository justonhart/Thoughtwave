import { Hero } from '../roles/hero';

const mainPowerOrder = [
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_EXTENSION,
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_REGEN_SOURCE,
    PWR_REGEN_SOURCE,
    PWR_REGEN_SOURCE,
    PWR_OPERATE_EXTENSION,
    PWR_REGEN_SOURCE,
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_EXTENSION,
    PWR_OPERATE_EXTENSION,
    PWR_OPERATE_FACTORY,
    PWR_OPERATE_OBSERVER,
    PWR_REGEN_SOURCE,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
];
const econPowerOrder = [
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_LAB,
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_REGEN_SOURCE,
    PWR_REGEN_SOURCE,
    PWR_REGEN_SOURCE,
    PWR_OPERATE_LAB,
    PWR_REGEN_SOURCE,
];

/**
 * Creates PowerCreeps and upgrades them according to the defined PowerOrder.
 * Upgrades only happen once per tick since otherwise it seems to cause issues where certain powers are not correctly upgraded.
 * @param powerCreeps
 */
export function createAndUpgradePCs(powerCreeps: PowerCreep[]) {
    if (Game.time % 999 === 0 || global.initiatingPowerCreeps) {
        try {
            // Create/Upgrade Powercreeps one tick per upgrade since it caused issues otherwise
            if (!powerCreeps.length) {
                PowerCreep.create('PCMain', POWER_CLASS.OPERATOR);
                global.initiatingPowerCreeps = true;
            } else if (powerCreeps.reduce((usedGpl, nextCreep) => (usedGpl += nextCreep.level + 1), 0) < Game.gpl.level) {
                global.initiatingPowerCreeps = true;
                if (powerCreeps.length === 1 && powerCreeps[0].level < 25) {
                    const mainPC = powerCreeps[0];
                    mainPC.upgrade(mainPowerOrder[mainPC.level]);
                } else if (powerCreeps.some((powerCreep) => powerCreep.level < 15)) {
                    const lowestPC = powerCreeps.reduce((lowestLevelPC, nextPC) => (nextPC.level < lowestLevelPC.level ? nextPC : lowestLevelPC));
                    lowestPC.upgrade(econPowerOrder[lowestPC.level]);
                } else {
                    PowerCreep.create('PCEcon' + powerCreeps.length, POWER_CLASS.OPERATOR);
                }
            } else {
                global.initiatingPowerCreeps = false;
            }
        } catch (e) {
            console.log(`Error caught in createAndUpgradePCs: \n${e}`);
            global.initiatingPowerCreeps = false;
        }
    }
}

/**
 * Spawn in all powercreeps to rooms in need or the ones with the lowest energyLevel (limited to rooms with powerSpawn).
 * TODO: Reserve 1 powerCreep (main? for defense) since respawn takes 8 hours
 * @param powerCreeps
 */
export function spawnPowerCreeps(powerCreeps: PowerCreep[]) {
    powerCreeps
        .filter((powerCreep) => !powerCreep.ticksToLive && (!powerCreep.spawnCooldownTime || powerCreep.spawnCooldownTime <= Date.now()))
        .forEach((powerCreep) => {
            const lowestEnergyRoom = Object.values(Game.rooms)
                .filter(
                    (room) =>
                        room.controller?.level === 8 && !!room.storage && !!room.powerSpawn && !powerCreeps.some((pc) => pc.room?.name === room.name)
                )
                .reduce(
                    (lowestEnergyRoom, nextRoom) =>
                        lowestEnergyRoom && nextRoom.storage.store[RESOURCE_ENERGY] > lowestEnergyRoom.storage.store[RESOURCE_ENERGY]
                            ? lowestEnergyRoom
                            : nextRoom,
                    undefined
                );
            if (lowestEnergyRoom) {
                powerCreep.spawn(lowestEnergyRoom.powerSpawn);
            }
        });
}

/**
 * Run all powerCreeps
 * @param powerCreeps
 */
export function runPowerCreeps(powerCreeps: PowerCreep[]) {
    powerCreeps
        .filter((powerCreep) => powerCreep.ticksToLive)
        .forEach((powerCreep) => {
            try {
                new Hero(powerCreep.id).run();
            } catch (e) {
                console.log(`Error caught in powerCreep ${powerCreep.id}: \n${e}`);
            }
        });
}
