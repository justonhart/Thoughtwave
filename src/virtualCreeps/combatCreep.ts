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
