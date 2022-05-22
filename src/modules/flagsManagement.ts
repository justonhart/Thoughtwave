import { addHostileRoom, unclaimRoom } from './empireManagement';
import { addOperation, findOperationOrigin } from './operationsManagement';
import { PopulationManagement } from './populationManagement';

export default function manageFlags() {
    if (Game.flags.colonize) {
        addOperation(OperationType.COLONIZE, Game.flags.colonize.pos.roomName);
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
        let origin = findOperationOrigin(Game.flags.intershardLaunch.pos.roomName);

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
        addOperation(OperationType.STERILIZE, Game.flags.sterilize.pos.roomName);
        Game.flags.sterilize.remove();
    }

    if (Game.flags.collect) {
        addOperation(OperationType.COLLECTION, Game.flags.collect.pos.roomName);
        Game.flags.collect.remove();
    }
}
