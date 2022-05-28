import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class Protector extends CombatCreep {
    public run() {
        if (this.hits < this.hitsMax && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }

        if (this.fledToNewRoom()) {
            return; // Wait while creep is healing
        }
        if (this.travelToRoom(this.memory.assignment, { avoidHostiles: false }) === IN_ROOM) {
            if (!this.memory.targetId || this.memory.assignment === this.homeroom.name) {
                this.memory.targetId = this.findTarget();
            }
            if (!this.memory.targetId) {
                return;
            }
            const target = Game.getObjectById(this.memory.targetId);

            let creepActionReturnCode: CreepActionReturnCode;
            if (target instanceof Creep) {
                this.combatPathing(target);
                creepActionReturnCode = this.attackCreep(target);
            } else if (target instanceof Structure) {
                creepActionReturnCode = this.attackStructure(target);
                if (creepActionReturnCode === ERR_NOT_IN_RANGE) {
                    this.travelTo(target, { range: 1 });
                }
            } else {
                delete this.memory.targetId;
            }

            // Enable retargeting on same tick
            if (!this.memory.combat.flee && creepActionReturnCode !== OK && creepActionReturnCode !== ERR_NOT_IN_RANGE) {
                delete this.memory.targetId;
            }
        }
    }

    private combatPathing(target: Creep) {
        // Prioritize rampart defense
        if (this.room.name === this.homeroom.name) {
            const currentRange = this.pos.getRangeTo(target);
            if (currentRange === 1) {
                return; // already in position
            }
            // After attackers are gone creep can leave rampart
            if (
                this.room.find(FIND_HOSTILE_CREEPS, {
                    filter: (creep: Creep) => creep.body.some((bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK),
                })
            ) {
                // TODO: how to check for breach? If breach then also do not do this
                const myRamparts = this.room.find(FIND_STRUCTURES).filter((structure) => structure.structureType === STRUCTURE_RAMPART);
                if (myRamparts.length) {
                    // Get closest rampart to the enemy that isn't already taken
                    let closestRampart = myRamparts.find((rampart) => Pathing.sameCoord(rampart.pos, this.pos))?.pos;
                    myRamparts
                        .filter((rampart) => !rampart.pos.lookFor(LOOK_CREEPS).some((creep) => creep.memory.role === Role.PROTECTOR))
                        .forEach((emptyRamparts) => {
                            if (!closestRampart || emptyRamparts.pos.getRangeTo(target.pos) < currentRange) {
                                closestRampart = emptyRamparts.pos;
                            }
                        });
                    console.log(closestRampart);
                    if (closestRampart) {
                        return this.travelTo(closestRampart);
                    }
                }
            }
        }

        if (this.memory.combat.flee) {
            // TODO: In homeroom this will not work ==> Shouldnt matter as soon as ramparts are up but otherwise move to spawn?
            // Go back to the exit toward creeps homeroom while avoiding creeps along the way
            return this.travelToRoom(this.homeroom.name, { ignoreCreeps: false, avoidHostiles: true });
        }

        if (this.getActiveBodyparts(ATTACK)) {
            return this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: 1 });
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            let range = 3;
            const exitCost = 10;
            let shouldFlee = true;

            const hostilesInSquadRange = this.pos.findInRange(FIND_HOSTILE_CREEPS, 3); // check around target for proper massAttack pathing
            const rangeToTarget = this.pos.getRangeTo(target);

            // If not in range or it is an enemy squad with not only ATTACK Creeps then go closer to enable massAttack
            if (
                rangeToTarget > range ||
                (hostilesInSquadRange.length > 1 && hostilesInSquadRange.some((creep) => creep.getActiveBodyparts(RANGED_ATTACK)))
            ) {
                range = 1;
                shouldFlee = false;
            } else if (!target.getActiveBodyparts(ATTACK)) {
                range = 2; // Against other RANGED_ATTACK units to keep them from fleeing
            }
            return this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: range, flee: shouldFlee, exitCost: exitCost });
        }
    }

    private findTarget() {
        const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
        if (hostileCreeps.length) {
            // Find closest Enemy and attack it to avoid stepping off ramparts as ATTACK creeps (include worker creeps as dangerous since they can dismantle)
            if (this.pos.roomName === this.homeroom.name) {
                const closestDangerousHostile = this.pos.findClosestByRange(hostileCreeps, {
                    filter: (creep: Creep) =>
                        creep.body.some((bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK),
                });
                if (closestDangerousHostile) {
                    return closestDangerousHostile.id;
                }
            }

            const healers = hostileCreeps.filter((creep) => creep.getActiveBodyparts(HEAL) > 0);

            if (healers.length) {
                return this.pos.findClosestByRange(healers).id;
            }

            const closestDangerousHostile = this.pos.findClosestByRange(hostileCreeps, {
                filter: (creep: Creep) => creep.body.some((bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK),
            }).id;

            return closestDangerousHostile.length ? closestDangerousHostile : this.pos.findClosestByRange(hostileCreeps).id;
        }
        const hostileRamparts = this.room.find(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_RAMPART });
        if (hostileRamparts.length) {
            return hostileRamparts[0].id;
        }

        const hostileStructures = this.room
            .find(FIND_HOSTILE_STRUCTURES)
            .filter((struct) => !(struct.structureType === STRUCTURE_STORAGE && struct.store.getUsedCapacity()));
        if (hostileStructures.length) {
            return hostileStructures[0].id;
        }
    }
}
