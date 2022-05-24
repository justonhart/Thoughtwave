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
            if (!this.memory.targetId) {
                this.memory.targetId = this.findTarget();
            }
            if (!this.memory.targetId) {
                return;
            }
            this.attackTarget();
        }
    }
}
