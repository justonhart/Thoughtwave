import { addHostileRoom, unclaimRoom } from './empireManagement';
import { addColonizationOperation, addSterilizeOperation, findBestColonyOrigin, findOperationOrigin } from './operationsManagement';
import { PopulationManagement } from './populationManagement';

export default function manageFlags() {
    if (Game.flags.colonize) {
        addColonizationOperation(Game.flags.colonize.pos);
        Game.flags.colonize.remove();
    }

    if (Game.flags.unclaim) {
        unclaimRoom(Game.flags.unclaim.pos.roomName);
        Game.flags.unclaim.remove();
    }

    if (Game.flags.hostile) {
        addHostileRoom(Game.flags.hostile.pos.roomName);
        Game.flags.hostile.remove();
    }

    if (Game.flags.intershardLaunch) {
        let origin = findBestColonyOrigin(Game.flags.intershardLaunch.pos);

        console.log(`Launching intershard colony from ${origin}`);

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM],
            memoryOptions: {
                role: Role.CLAIMER,
            },
        });

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
            memoryOptions: {
                role: Role.COLONIZER,
            },
        });

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
            memoryOptions: {
                role: Role.COLONIZER,
            },
        });

        Memory.empire.spawnAssignments.push({
            designee: origin,
            body: PopulationManagement.createPartsArray([WORK, CARRY, MOVE, MOVE], Game.rooms[origin].energyCapacityAvailable),
            memoryOptions: {
                role: Role.COLONIZER,
            },
        });

        Game.flags.intershardLaunch.remove();
    }

    if (Game.flags.setManagerPos) {
        let managerPos = Game.flags.setManagerPos.pos;
        Memory.rooms[Game.flags.setManagerPos.room.name].managerPos = managerPos.toMemSafe();
        Game.flags.setManagerPos.remove();
    }

    if (Game.flags.sterilize) {
        addSterilizeOperation(Game.flags.sterilize.pos);
        Game.flags.sterilize.remove();
    }
}
