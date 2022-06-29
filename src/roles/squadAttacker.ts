import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
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
                squadManagement.formationPathing(this.getActiveBodyparts(RANGED_ATTACK) ? 2 : 1);
            }

            // No target for second leader
            this.attackTarget(squadManagement, this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1);
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

            this.attackTarget(squadManagement, range);
        }
        squadManagement.cleanUp();
    }

    private attackTarget(squadManagement: SquadManagement, range: number) {
        const target = squadManagement.findPriorityAttackTarget(range);

        if (target) {
            if (target instanceof Creep) {
                this.attackCreep(target);
            } else if (target instanceof Structure) {
                this.attackStructure(target);
            }
        }
    }
}
