import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadDismantler extends CombatCreep {
    protected run() {
        const squadManagement = new SquadManagement(this);
        // --- QUADS
        let fleeing = false;
        if (squadManagement.isPartOfQuad()) {
            if (squadManagement.missingQuadCreep()) {
                squadManagement.fleeing();
                fleeing = true;
            }

            if (!fleeing && !squadManagement.closeToTargetRoom()) {
                if (squadManagement.getInLineFormation()) {
                    squadManagement.linePathing();
                }
            } else if (!fleeing && squadManagement.getInFormation()) {
                squadManagement.formationPathing(1);
            }

            // No target for second leader
            this.dismantleTarget(squadManagement);
        }

        // --- DUO
        if (squadManagement.isPartOfDuo()) {
            if (squadManagement.missingDuoCreep()) {
                squadManagement.fleeing();
                fleeing = true;
            }

            const range = this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
            if (!fleeing && squadManagement.getInDuoFormation()) {
                squadManagement.duoPathing(range);
            }

            this.dismantleTarget(squadManagement);
        }
        squadManagement.cleanUp();
    }

    private dismantleTarget(squadManagement: SquadManagement) {
        const target = squadManagement.findPriorityDismantleTarget();

        if (target) {
            this.dismantle(target);
        }
    }
}
