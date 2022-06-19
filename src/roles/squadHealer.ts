import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadHealer extends CombatCreep {
    protected run() {
        if (SquadManagement.isPartOfQuad(this) && SquadManagement.missingQuadCreep(this)) {
            SquadManagement.setupQuad(this);
            SquadManagement.fleeing(this);
        }

        if (SquadManagement.isPartOfDuo(this) && SquadManagement.missingDuoCreep(this)) {
            SquadManagement.setupDuo(this);
            SquadManagement.fleeing(this);
        }

        // action
        const target = SquadManagement.getSquadHealingTarget(this);
        if (this.pos.isNearTo(target)) {
            this.heal(target);
        } else {
            this.rangedHeal(target);
        }
    }
}
