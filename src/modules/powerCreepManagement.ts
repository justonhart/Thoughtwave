import { Hero } from '../roles/hero';

const powerOrder = [
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_TOWER,
    PWR_OPERATE_LAB, // Interchangeable
    PWR_GENERATE_OPS,
    PWR_OPERATE_SPAWN,
    PWR_OPERATE_TOWER,
    PWR_REGEN_SOURCE,
    PWR_REGEN_SOURCE,
    PWR_REGEN_SOURCE,
    PWR_OPERATE_LAB, // Interchangeable
    PWR_REGEN_SOURCE,
] as PowerConstant[];

/**
 * Creates PowerCreeps and upgrades them according to the defined PowerOrder.
 * Upgrades only happen once per tick since otherwise it seems to cause issues where certain powers are not correctly upgraded.
 * @param powerCreeps
 */
export function createAndUpgradePCs(powerCreeps: PowerCreep[]) {
    if (Game.time % 999 === 0 || global.initiatingPowerCreeps) {
        try {
            // Create/Upgrade Powercreeps one tick per upgrade since it caused issues otherwise
            if (!powerCreeps.length || powerCreeps.reduce((usedGpl, nextCreep) => (usedGpl += nextCreep.level + 1), 0) < Game.gpl.level) {
                global.initiatingPowerCreeps = true;
                if (powerCreeps.some((powerCreep) => powerCreep.level < 15)) {
                    const lowestPC = powerCreeps.reduce((lowestLevelPC, nextPC) => (nextPC.level < lowestLevelPC.level ? nextPC : lowestLevelPC));
                    lowestPC.upgrade(getPowerOrder(powerCreeps.length <= 1)[lowestPC.level]);
                } else {
                    PowerCreep.create('pc' + powerCreeps.length, POWER_CLASS.OPERATOR);
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
 * Replace the interchangeable power. Here we can also add factory/observer/etc. powers later if needed.
 * @param isInitialPowerCreep For now it will only spawn one (the first) creep with operateExtension
 * @returns
 */
function getPowerOrder(isInitialPowerCreep: boolean) {
    if (isInitialPowerCreep) {
        powerOrder[6] = PWR_OPERATE_EXTENSION;
        powerOrder[13] = PWR_OPERATE_EXTENSION;
        return powerOrder;
    } else {
        powerOrder[6] = PWR_OPERATE_LAB;
        powerOrder[13] = PWR_OPERATE_LAB;
        return powerOrder;
    }
}

/**
 * Spawn in all powercreeps to rooms in need or the ones with the lowest energyLevel (limited to rooms with powerSpawn).
 * TODO: Reserve 1 powerCreep (main? for defense) since respawn takes 8 hours
 * @param powerCreeps
 */
export function spawnPowerCreeps(powerCreeps: PowerCreep[]) {
    if (global.initiatingPowerCreeps) {
        return;
    }
    powerCreeps
        .filter(
            (powerCreep) =>
                !powerCreep.ticksToLive && powerCreep.level && (!powerCreep.spawnCooldownTime || powerCreep.spawnCooldownTime <= Date.now())
        )
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
