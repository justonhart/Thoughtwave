import { CombatCreep } from '../virtualCreeps/combatCreep';

export class Protector extends CombatCreep {
    protected run() {
        if (!this.hasActiveBodyparts(RANGED_ATTACK) && !this.hasActiveBodyparts(ATTACK)) {
            this.memory.combat.flee = true;
        }

        if (this.fledToNewRoom()) {
            this.healSelf(false);
            return; // Wait while creep is healing
        }
        if (this.travelToRoom(this.memory.assignment) === IN_ROOM || this.memory.targetId) {
            this.memory.targetId = this.findTarget();
            const target = Game.getObjectById(this.memory.targetId);

            // Heal Self and other creeps in room when there is no target or the target is a powerBank
            if ((!target || target instanceof StructurePowerBank) && this.hasActiveBodyparts(HEAL)) {
                if (this.damaged()) {
                    this.healSelf(false);
                    return;
                } else {
                    const hurtCreep = this.room.myCreeps.find((creep) => creep.hits < creep.hitsMax);
                    if (hurtCreep) {
                        const healing = this.heal(hurtCreep);
                        if (healing === ERR_NOT_IN_RANGE) {
                            this.travelTo(hurtCreep, { range: 1 });
                        }
                        return;
                    }
                }
            }

            let creepActionReturnCode: CreepActionReturnCode;
            if (target instanceof Creep) {
                this.combatPathing(target);
                creepActionReturnCode = this.attackCreep(target);
            } else if (target instanceof Structure && (!(target instanceof StructurePowerBank) || !this.memory.stop)) {
                creepActionReturnCode = this.attackStructure(target);
                if (
                    creepActionReturnCode === ERR_NOT_IN_RANGE ||
                    (target.structureType !== STRUCTURE_POWER_BANK && !this.pos.isNearTo(target.pos.x, target.pos.y))
                ) {
                    this.travelTo(target, { range: 1 });
                }
            }

            // Enable retargeting on same tick
            if (!this.memory.combat.flee && creepActionReturnCode !== OK && creepActionReturnCode !== ERR_NOT_IN_RANGE) {
                delete this.memory.targetId;
            }
            if (creepActionReturnCode !== OK && this.hasActiveBodyparts(ATTACK)) {
                this.healSelf(false);
            } else {
                this.healSelf(this.hasActiveBodyparts(ATTACK));
            }

            if (!target) {
                this.travelTo(new RoomPosition(25, 25, this.room.name), { range: 22 });
            }
        } else if (this.damaged()) {
            this.healSelf(this.defendSelf());
        }
    }

    private findTarget() {
        const hostileCreeps = this.room.hostileCreeps.filter((c) => c.owner.username !== 'Source Keeper');
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

            const closestDangerousHostile = this.pos.findClosestByRange(hostileCreeps, {
                filter: (creep: Creep) => creep.body.some((bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK),
            })?.id;

            return closestDangerousHostile?.length ? closestDangerousHostile : this.pos.findClosestByRange(hostileCreeps).id;
        }
        const hostileRamparts = this.room.hostileStructures.filter((struct) => struct.structureType == STRUCTURE_RAMPART);
        if (hostileRamparts.length) {
            return hostileRamparts[0].id;
        }

        const hostileStructure = this.room.hostileStructures.find(
            (struct) => struct.hits > 0 && !(struct.structureType === STRUCTURE_STORAGE && struct.store.getUsedCapacity())
        );
        if (hostileStructure) {
            return hostileStructure.id;
        }
    }
}
