import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class RampartProtector extends CombatCreep {
    protected run() {
        if (this.hits < this.hitsMax && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }

        // First find the targetedRampart. If none is present (for example gcl < 4), then find the hostileCreep
        if (!this.memory.targetId) {
            const hostileCreepId = this.findTarget();
            this.memory.targetId = this.getTargetedRampart(hostileCreepId);
            if (!this.memory.targetId) {
                this.memory.targetId = hostileCreepId;
            }
        }
        if (!this.memory.targetId) {
            this.memory.currentTaskPriority = Priority.LOW;
            return;
        }
        this.memory.currentTaskPriority = Priority.HIGH;
        const target = Game.getObjectById(this.memory.targetId);

        let creepActionReturnCode: CreepActionReturnCode;
        if (target instanceof StructureRampart) {
            const targetCreep = Game.getObjectById(this.findTarget());
            this.pathingToRampart(target);
            creepActionReturnCode = this.attackCreep(targetCreep);
            if (this.pos.getRangeTo(targetCreep) > 1) {
                creepActionReturnCode = ERR_NOT_IN_RANGE; // Creep should always reevaluate for closest rampart if there is no enemy creep in the vicinity (squads sometimes move to other parts that are only 2 blocks away so ranged will only attack one creep otherwise)
            }
        } else if (target instanceof Creep) {
            this.combatPathing(target);
            creepActionReturnCode = this.attackCreep(target);
        }

        if (creepActionReturnCode !== OK) {
            delete this.memory.targetId;
        }
    }

    private pathingToRampart(targetRampart: StructureRampart) {
        // Already at target
        if (!targetRampart || Pathing.sameCoord(this.pos, targetRampart.pos)) {
            return;
        }

        this.travelTo(targetRampart, { preferRamparts: true });
    }

    private findTarget(): Id<Creep> {
        const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
        if (hostileCreeps.length) {
            const closestDangerousHostile = this.pos.findClosestByRange(hostileCreeps, {
                filter: (creep: Creep) =>
                    creep.body.some((bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK),
            });

            if (closestDangerousHostile) {
                return closestDangerousHostile.id;
            }
        }
    }

    /**
     * Check all ramparts to find the one that is being attacked and does not yet have a defender
     * @returns
     */
    private getTargetedRampart(hostileCreepId: Id<Creep>): Id<StructureRampart> {
        if (hostileCreepId) {
            const myRamparts = this.room
                .find(FIND_STRUCTURES)
                .filter(
                    (structure) =>
                        structure.structureType === STRUCTURE_RAMPART && this.room.memory.miningAssignments[structure.pos.toMemSafe()] === undefined
                ) as StructureRampart[];

            if (myRamparts.length) {
                // Find all ramparts that are being attacked and not yet have a protector on them
                const targetedRampart = myRamparts.find((rampart) =>
                    this.room
                        .lookAtArea(rampart.pos.y - 1, rampart.pos.x - 1, rampart.pos.y + 1, rampart.pos.x + 1, true)
                        .find(
                            (lookObject) =>
                                lookObject.type === LOOK_CREEPS &&
                                lookObject.creep?.owner?.username !== this.owner.username &&
                                !rampart.pos.lookFor(LOOK_CREEPS).some((creep) => creep.memory.role === Role.RAMPART_PROTECTOR)
                        )
                );

                if (targetedRampart) {
                    return targetedRampart.id;
                }

                // If no rampart is getting attacked yet then get closest rampart to the enemy that isn't already taken
                const closestHostile = Game.getObjectById(hostileCreepId);
                let closestRampartToHostile = myRamparts.find((rampart) => Pathing.sameCoord(rampart.pos, this.pos));

                myRamparts
                    .filter((rampart) => !rampart.pos.lookFor(LOOK_CREEPS).some((creep) => creep.memory.role === Role.PROTECTOR))
                    .forEach((emptyRamparts) => {
                        if (
                            !closestRampartToHostile ||
                            emptyRamparts.pos.getRangeTo(closestHostile.pos) < closestRampartToHostile.pos.getRangeTo(closestHostile.pos)
                        ) {
                            closestRampartToHostile = emptyRamparts;
                        }
                    });

                if (closestRampartToHostile) {
                    return closestRampartToHostile.id;
                }
            }
        }
    }
}
