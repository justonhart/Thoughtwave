import { Pathing } from '../modules/pathing';
import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
    protected run() {
        const sq = new SquadManagement(this);
        sq.pathing();
        // Healing (+ RANGED_ATTACK if possible)
        let healingTarget: Creep;
        if (this.getActiveBodyparts(HEAL)) {
            const healingTarget = sq.getSquadHealingTarget();
            if (healingTarget) {
                if (this.pos.isNearTo(healingTarget)) {
                    this.heal(healingTarget);
                    if (this.getActiveBodyparts(RANGED_ATTACK)) {
                        // close range heal and rangedAttack can both happen in the same tick
                        this.attackTarget(3, sq);
                    }
                } else {
                    this.rangedHeal(healingTarget);
                }
            }
        }

        // Attacking (WORK/ATTACK/RANGED_ATTACK)
        if (!healingTarget) {
            if (this.getActiveBodyparts(WORK)) {
                this.dismantleTarget(sq);
            } else if (this.getActiveBodyparts(ATTACK)) {
                this.attackTarget(1, sq);
            } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
                this.attackTarget(3, sq);
            }
        }
    }

    private attackTarget(range: number, sq: SquadManagement) {
        const target = this.findPriorityAttackTarget(range, sq);

        if (target) {
            if (target instanceof Creep) {
                this.attackCreep(target);
            } else if (target instanceof Structure) {
                this.attackStructure(target);
            }
        }
    }

    private findPriorityAttackTarget(range: number, sq: SquadManagement) {
        const areaInRange = Pathing.getArea(this.pos, range);
        const lookAtArea = this.room.lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true);
        const hostileCreep = lookAtArea.filter(
            (lookObject) =>
                lookObject.type === LOOK_CREEPS && lookObject.creep?.owner?.username !== this.owner.username && !lookObject.creep?.spawning
        );
        const unprotectedHostileCreep = lookAtArea.filter(
            (lookObject) =>
                lookObject.type === LOOK_STRUCTURES &&
                lookObject.structure.structureType !== STRUCTURE_RAMPART &&
                hostileCreep.some((look) => look.creep.pos.x === lookObject.structure.pos.x && look.creep.pos.y === lookObject.structure.pos.y)
        );
        if (unprotectedHostileCreep.length) {
            return unprotectedHostileCreep[0].creep;
        }

        if (this.pos.roomName === sq.assignment && !sq.isFleeing) {
            if (Game.flags.target?.pos?.roomName === sq.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
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

            const obstacleStructure = sq.getObstacleStructure();
            if (obstacleStructure && (!target || this.pos.getRangeTo(target) > range)) {
                return obstacleStructure;
            }

            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username !== 'Source Keeper' });
            }
            if (!target) {
                target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType !== STRUCTURE_KEEPER_LAIR && struct.structureType !== STRUCTURE_CONTROLLER,
                });
            }
            return target;
        }
    }

    private dismantleTarget(sq: SquadManagement) {
        const target = this.findPriorityDismantleTarget(sq);

        if (target) {
            this.dismantle(target);
        }
    }

    private findPriorityDismantleTarget(sq: SquadManagement) {
        if (this.pos.roomName === sq.assignment) {
            if (Game.flags.target?.pos?.roomName === sq.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }

            const targetStructure = sq.targetStructure ? Game.getObjectById(sq.targetStructure) : undefined;
            if (targetStructure && this.pos.getRangeTo(targetStructure) === 1) {
                return targetStructure;
            } else if (targetStructure) {
                const obstacleStructure = sq.getObstacleStructure();
                if (obstacleStructure) {
                    return obstacleStructure;
                }
            }

            let target: any;
            if (!target) {
                const structuresToSearch = this.room.find(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) =>
                        struct.structureType !== STRUCTURE_STORAGE &&
                        struct.structureType !== STRUCTURE_TERMINAL &&
                        struct.structureType !== STRUCTURE_LAB &&
                        struct.structureType !== STRUCTURE_NUKER &&
                        struct.structureType !== STRUCTURE_KEEPER_LAIR &&
                        struct.structureType !== STRUCTURE_CONTROLLER,
                });

                target = this.pos.findClosestByRange(structuresToSearch, {
                    filter: (struct) => struct.structureType === STRUCTURE_TOWER,
                });

                if (!target) {
                    target = this.pos.findClosestByRange(structuresToSearch, {
                        filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                    });
                }
                if (!target) {
                    target = this.pos.findClosestByRange(structuresToSearch, {
                        filter: (s) => s.hits > 0 && s.hits < 50000,
                    });
                }
                if (!target) {
                    target = this.pos.findClosestByRange(structuresToSearch, {
                        filter: (struct) => struct.hits > 0,
                    });
                }
            }
            return target;
        }
    }
}
