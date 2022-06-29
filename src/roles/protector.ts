import { CombatCreep } from '../virtualCreeps/combatCreep';

export class Protector extends CombatCreep {
    protected run() {
        if (this.hits < this.hitsMax && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }

        if (!this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK)) {
            this.memory.combat.flee = true;
        }

        if (this.fledToNewRoom()) {
            return; // Wait while creep is healing
        }
        if (this.travelToRoom(this.memory.assignment) === IN_ROOM || this.memory.targetId) {
            if (
                !this.memory.targetId ||
                !Game.getObjectById(this.memory.targetId) ||
                Game.getObjectById(this.memory.targetId).pos.roomName !== this.memory.assignment
            ) {
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
                if (creepActionReturnCode === ERR_NOT_IN_RANGE || !this.pos.isNearTo(target.pos.x, target.pos.y)) {
                    this.travelTo(target, { range: 1 });
                }
            }

            // Enable retargeting on same tick
            if (!this.memory.combat.flee && creepActionReturnCode !== OK && creepActionReturnCode !== ERR_NOT_IN_RANGE) {
                delete this.memory.targetId;
            }
        }
    }

    private findTarget() {
        const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
        if (hostileCreeps.length) {
            // Find closest Enemy and attack it to avoid stepping off ramparts as ATTACK creeps (include worker creeps as dangerous since they can dismantle)
            if (this.pos.roomName === this.homeroom?.name) {
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
            })?.id;

            return closestDangerousHostile?.length ? closestDangerousHostile : this.pos.findClosestByRange(hostileCreeps).id;
        }
        const hostileRamparts = this.room.find(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_RAMPART });
        if (hostileRamparts.length) {
            return hostileRamparts[0].id;
        }

        const hostileStructures = this.room
            .find(FIND_HOSTILE_STRUCTURES)
            .filter(
                (struct) =>
                    struct.structureType !== STRUCTURE_CONTROLLER && !(struct.structureType === STRUCTURE_STORAGE && struct.store.getUsedCapacity())
            );
        if (hostileStructures.length) {
            return hostileStructures[0].id;
        }
    }
}
