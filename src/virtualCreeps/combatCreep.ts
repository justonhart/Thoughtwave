import { WaveCreep } from './waveCreep';

export class CombatCreep extends WaveCreep {
    protected attackCreep(target: Creep): CreepActionReturnCode {
        if (this.getActiveBodyparts(ATTACK)) {
            return this.attack(target);
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            // Can't use nearTo as we want to use MassAttack even if it is not the targetHostileCreep that is near us
            if (
                this.room
                    .lookForAtArea(LOOK_CREEPS, this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true)
                    .filter((lookObject) => lookObject.creep.owner?.username !== this.owner.username).length
            ) {
                return this.rangedMassAttack();
            } else {
                return this.rangedAttack(target);
            }
        }
        return ERR_NO_BODYPART;
    }

    protected combatPathing(target: Creep) {
        if (this.memory.combat.flee) {
            // Info: In homeroom this will not work ==> Shouldnt matter as soon as ramparts are up but otherwise move to spawn?
            // Go back to the exit toward creeps homeroom while avoiding creeps along the way
            return this.travelToRoom(this.homeroom?.name, { ignoreCreeps: false, avoidSourceKeepers: true });
        }

        if (this.getActiveBodyparts(ATTACK)) {
            return this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: 1 });
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            let range = 3;
            const exitCost = 10;
            let shouldFlee = true;

            const hostilesInSquadRange = this.pos.findInRange(FIND_HOSTILE_CREEPS, 3); // check around target for proper massAttack pathing
            const rangeToTarget = this.pos.getRangeTo(target);

            // If not in range, an enemy squad with RANGED_ATTACK, or no dangerous creeps, then go closer to enable massAttack
            if (
                rangeToTarget > range ||
                (hostilesInSquadRange.length > 1 && hostilesInSquadRange.some((creep) => creep.getActiveBodyparts(RANGED_ATTACK))) ||
                !hostilesInSquadRange.some((creep) => creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK))
            ) {
                range = 1;
                shouldFlee = false;
            } else if (!target.getActiveBodyparts(ATTACK)) {
                range = 2; // Against other RANGED_ATTACK units to keep them from fleeing
            }
            return this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: range, flee: shouldFlee, exitCost: exitCost });
        }
    }

    protected attackStructure(target: Structure): CreepActionReturnCode {
        if (this.getActiveBodyparts(ATTACK)) {
            return this.attack(target);
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            return this.rangedAttack(target);
        }
        return ERR_NO_BODYPART;
    }

    /**
     * Flee to a different room to heal.
     *
     * @returns boolean, to see if creep has arrived in new room
     */
    public fledToNewRoom(): boolean {
        if (!this.memory.combat?.flee && this.hits / this.hitsMax < 0.4 && this.getActiveBodyparts(HEAL)) {
            this.memory.combat.flee = true;
        } else if (this.memory.combat?.flee && this.hits / this.hitsMax > 0.8) {
            this.memory.combat.flee = false;
        }
        if (this.memory.combat?.flee && this.pos.roomName !== this.memory.assignment) {
            this.moveOffExit(); // TODO: this could be an issue if exit is blocked
            return true; // Creep retreated to previous room to heal
        }
        return false;
    }
}
