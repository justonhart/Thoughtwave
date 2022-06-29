import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadHealer extends CombatCreep {
    protected run() {
        const squadManagement = new SquadManagement(this);
        if (squadManagement.isPartOfQuad() && squadManagement.missingQuadCreep()) {
            squadManagement.fleeing();
        }

        if (squadManagement.isPartOfDuo() && squadManagement.missingDuoCreep()) {
            squadManagement.fleeing();
        }

        // action
        const target = squadManagement.getSquadHealingTarget();
        if (this.pos.isNearTo(target)) {
            this.heal(target);
        } else {
            this.rangedHeal(target);
        }
        squadManagement.cleanUp();
    }
}
