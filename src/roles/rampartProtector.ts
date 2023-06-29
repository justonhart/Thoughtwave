import { CombatIntel } from '../modules/combatIntel';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class RampartProtector extends CombatCreep {
    protected run() {
        if ((this.damaged() || this.memory.targetId) && this.hasActiveBodyparts(HEAL)) {
            this.heal(this);
        }

        // Move to targetRoom
        if (this.memory.assignment && this.travelToRoom(this.memory.assignment) !== IN_ROOM) {
            return;
        }

        // Attack a specific target
        let targetCreep = Game.getObjectById((this.memory as RampartProtectorMemory).targetId);
        if (targetCreep) {
            this.attackCreep(targetCreep);
        } else {
            targetCreep = this.findWeakestCreepInRange();
            if (targetCreep) {
                this.attackCreep(targetCreep);
            } else {
                targetCreep = this.pos.findClosestByRange(this.room.hostileCreeps);
            }
        }

        // Travel to target position (usually a rampart)
        const targetPos = (this.memory as RampartProtectorMemory).targetPos;
        if (targetPos) {
            const target = targetPos.toRoomPos();
            if (!this.pos.isEqualTo(target)) {
                this.travelTo(target);
            }
        } else if (targetCreep) {
            this.combatPathing(targetCreep);
        }
    }

    /**
     * Find the weakest Creep in range
     * @returns
     */
    private findWeakestCreepInRange(): Creep {
        const range = this.hasActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
        const hostileCreepsInRange = this.room.hostileCreeps.filter((hostileCreep) => this.pos.getRangeTo(hostileCreep) <= range);
        if (hostileCreepsInRange?.length === 1) {
            return hostileCreepsInRange[0];
        } else if (hostileCreepsInRange?.length > 1) {
            // Attack weakest Creep in range
            const combatIntelMe = CombatIntel.getCreepCombatData(this.room, false, this.pos);
            const combatIntelEnemy = CombatIntel.getCreepCombatData(this.room, true, hostileCreepsInRange[0].pos);
            let predictedDamage = CombatIntel.getPredictedDamage(
                combatIntelMe.totalRanged,
                combatIntelEnemy.highestDmgMultiplier,
                combatIntelEnemy.highestToughHits
            );
            return hostileCreepsInRange.reduce(
                (weakestCreepInfo, nextCreep) => {
                    const combatIntelEnemy = CombatIntel.getCreepCombatData(this.room, true, nextCreep.pos);
                    predictedDamage = CombatIntel.getPredictedDamage(
                        combatIntelMe.totalRanged,
                        combatIntelEnemy.highestDmgMultiplier,
                        combatIntelEnemy.highestToughHits
                    );
                    if (weakestCreepInfo.predictedDamage < predictedDamage) {
                        return { creep: nextCreep, predictedDamage: predictedDamage };
                    }

                    return weakestCreepInfo;
                },
                { creep: hostileCreepsInRange[0], predictedDamage: predictedDamage }
            ).creep;
        }
    }
}
