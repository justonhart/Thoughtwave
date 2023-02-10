import { addHostileRoom, addVisionRequest, unclaimRoom } from './data';
import { addOperation } from './operationsManagement';
import { findBunkerLocation } from './roomDesign';

export default function manageFlags() {
    if (Game.flags.colonize) {
        let portalLocations = [];

        if (Game.flags.portal) {
            portalLocations.push(Game.flags.portal.pos.toMemSafe());
            Game.flags.portal.remove();
        }

        let opts: OperationOpts = {
            portalLocations: portalLocations,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                selectionCriteria: OriginCriteria.CLOSEST,
            };
        }

        addOperation(OperationType.COLONIZE, Game.flags.colonize.pos.roomName, opts);
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

    if (Game.flags.setManagerPos) {
        let managerPos = Game.flags.setManagerPos.pos;
        Memory.rooms[Game.flags.setManagerPos.room.name].managerPos = managerPos.toMemSafe();
        Game.flags.setManagerPos.remove();
    }

    if (Game.flags.sterilize) {
        let portalLocations = [];
        if (Game.flags.portal) {
            portalLocations.push(Game.flags.portal.pos.toMemSafe());
            Game.flags.portal.remove();
        }
        let opts: OperationOpts = {
            portalLocations: portalLocations,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                selectionCriteria: OriginCriteria.CLOSEST,
            };
        }

        addOperation(OperationType.STERILIZE, Game.flags.sterilize.pos.roomName, opts);
        Game.flags.sterilize.remove();
    }

    if (Game.flags.collect) {
        let opts: OperationOpts = {
            operativeCount: 2,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                minEnergyStatus: EnergyStatus.CRITICAL,
                selectionCriteria: OriginCriteria.CLOSEST,
            };
        }

        addOperation(OperationType.COLLECTION, Game.flags.collect.pos.roomName, opts);
        Game.flags.collect.remove();
    }

    if (Game.flags.secure) {
        addOperation(OperationType.SECURE, Game.flags.secure.pos.roomName, {
            operativeCount: 2,
            expireAt: Game.time + 4500,
        });
        Game.flags.secure.remove();
    }

    if (Game.flags.recover) {
        let opts: OperationOpts = {};

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                selectionCriteria: OriginCriteria.HIGHEST_LEVEL,
            };
        }
        addOperation(OperationType.ROOM_RECOVERY, Game.flags.recover.pos.roomName, opts);
        Game.flags.recover.remove();
    }

    if (Game.flags.attack) {
        let forcedDestinations = [];
        const flagName = 'squadMove';
        let step = 1;
        while (Game.flags[flagName + step]) {
            forcedDestinations.push(Game.flags[flagName + step].pos.toMemSafe());
            Game.flags[flagName + step].remove();
            step++;
        }
        let opts: OperationOpts = {
            forcedDestinations: forcedDestinations,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                selectionCriteria: OriginCriteria.HIGHEST_LEVEL,
            };
        }
        addOperation(OperationType.ATTACK, Game.flags.attack.pos.roomName, opts);
        Game.flags.attack.remove();
    }

    if (Game.flags.quadAttack) {
        let forcedDestinations = [];
        const flagName = 'squadMove';
        let step = 1;
        while (Game.flags[flagName + step]) {
            forcedDestinations.push(Game.flags[flagName + step].pos.toMemSafe());
            Game.flags[flagName + step].remove();
            step++;
        }
        let opts: OperationOpts = {
            forcedDestinations: forcedDestinations,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                selectionCriteria: OriginCriteria.HIGHEST_LEVEL,
            };
        }
        addOperation(OperationType.QUAD_ATTACK, Game.flags.quadAttack.pos.roomName, opts);
        Game.flags.quadAttack.remove();
    }

    if (Game.flags.boost) {
        let opts: OperationOpts = {
            operativeCount: 3,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                minEnergyStatus: EnergyStatus.STABLE,
                selectionCriteria: OriginCriteria.CLOSEST,
            };
        }
        addOperation(OperationType.UPGRADE_BOOST, Game.flags.boost.pos.roomName, opts);
        Game.flags.boost.remove();
    }

    if (Game.flags.build) {
        let opts: OperationOpts = {
            operativeCount: 3,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                minEnergyStatus: EnergyStatus.STABLE,
                selectionCriteria: OriginCriteria.CLOSEST,
            };
        }
        addOperation(OperationType.REMOTE_BUILD, Game.flags.build.pos.roomName, opts);
        Game.flags.build.remove();
    }

    if (Game.flags.clean) {
        let opts: OperationOpts = {
            operativeCount: 2,
        };

        if (Game.flags.origin) {
            opts.originRoom = Game.flags.origin.pos.roomName;
            Game.flags.origin.remove();
        } else {
            opts.originOpts = {
                minEnergyStatus: EnergyStatus.STABLE,
                selectionCriteria: OriginCriteria.CLOSEST,
            };
        }
        addOperation(OperationType.CLEAN, Game.flags.clean.pos.roomName, opts);
        Game.flags.clean.remove();
    }

    if (Game.flags.layout) {
        addVisionRequest({ targetRoom: Game.flags.layout.pos.roomName });
        if (Game.rooms[Game.flags.layout.pos.roomName]) {
            findBunkerLocation(Game.rooms[Game.flags.layout.pos.roomName]);
        }
    }
}
