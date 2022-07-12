import { Pathing } from '../modules/pathing';
import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
    protected run() {
        SquadManagement.setup(this);
        SquadManagement.pathing();
        // Healing (+ RANGED_ATTACK if possible)
        let healingTarget: Creep;
        if (this.getActiveBodyparts(HEAL)) {
            const healingTarget = SquadManagement.getSquadHealingTarget();
            if (healingTarget) {
                if (this.pos.isNearTo(healingTarget)) {
                    this.heal(healingTarget);
                    if (this.getActiveBodyparts(RANGED_ATTACK)) {
                        // close range heal and rangedAttack can both happen in the same tick
                        this.attackTarget(3);
                    }
                } else {
                    this.rangedHeal(healingTarget);
                }
            }
        }

        // Attacking (WORK/ATTACK/RANGED_ATTACK)
        if (!healingTarget) {
            if (this.getActiveBodyparts(WORK)) {
                this.dismantleTarget();
            } else if (this.getActiveBodyparts(ATTACK)) {
                this.attackTarget(1);
            } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
                this.attackTarget(3);
            }
        }
    }

    private attackTarget(range: number) {
        const target = this.findPriorityAttackTarget(range);

        if (target) {
            if (target instanceof Creep) {
                this.attackCreep(target);
            } else if (target instanceof Structure) {
                this.attackStructure(target);
            }
        }
    }

    private findPriorityAttackTarget(range: number) {
        const areaInRange = Pathing.getArea(this.pos, range);
        const unprotectedHostileCreep = this.room
            .lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true)
            .filter(
                (lookObject) =>
                    lookObject.type === LOOK_CREEPS &&
                    lookObject.creep?.owner?.username !== this.owner.username &&
                    !lookObject.creep?.spawning &&
                    lookObject.structure?.structureType !== STRUCTURE_RAMPART
            );
        if (unprotectedHostileCreep.length) {
            return unprotectedHostileCreep[0].creep;
        }

        if (this.pos.roomName === SquadManagement.assignment && !SquadManagement.isFleeing) {
            if (Game.flags.target?.pos?.roomName === SquadManagement.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }
            const obstacleStructure = SquadManagement.getObstacleStructure();
            if (obstacleStructure) {
                return obstacleStructure;
            }
            let target: any;
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_TOWER,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
            }
            return target;
        }
    }

    private dismantleTarget() {
        const target = this.findPriorityDismantleTarget();

        if (target) {
            this.dismantle(target);
        }
    }

    private findPriorityDismantleTarget() {
        if (this.pos.roomName === SquadManagement.assignment) {
            if (Game.flags.target?.pos?.roomName === SquadManagement.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }

            const obstacleStructure = SquadManagement.getObstacleStructure();
            if (obstacleStructure) {
                return obstacleStructure;
            }
            let target: any;
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_TOWER,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
            }
            return target;
        }
    }
}
