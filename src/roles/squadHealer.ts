import { posFromMem } from '../modules/memoryManagement';
import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadHealer extends CombatCreep {
    protected run() {
        const squadLeader = Game.getObjectById(this.memory.combat.squadLeader);

        if (squadLeader) {
            const target = this.hits / this.hitsMax < squadLeader.hits / squadLeader.hitsMax ? this : squadLeader;
            this.heal(target);

            // movement
            if (this.pos.isNearTo(squadLeader)) {
                this.move(this.pos.getDirectionTo(squadLeader));
            } else {
                this.travelTo(squadLeader, { range: 1, reusePath: 0 });
            }
        } else {
            // Leader is dead so retreat and heal self
            this.heal(this);
            if (this.pos.roomName !== this.memory.assignment) {
                return; // Wait on new squad leader
            }
            this.flee();
        }
    }
}
