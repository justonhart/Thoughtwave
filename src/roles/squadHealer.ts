import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadHealer extends CombatCreep {
    protected run() {
        const squadLeader = this.memory.combat.squadLeader ? Game.getObjectById(this.memory.combat.squadLeader) : undefined;

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

            const newSquadLeader = this.room.creeps.find(
                (creep) =>
                    creep.memory.role === Role.SQUAD_ATTACKER &&
                    creep.memory.assignment === this.memory.assignment &&
                    (!creep.memory.combat.squadFollower || creep.memory.combat.squadFollower === this.id)
            );
            if (newSquadLeader) {
                this.memory.combat.squadLeader = newSquadLeader.id;
            } else {
                if (this.pos.roomName !== this.memory.assignment) {
                    this.moveOffExit();
                    return; // Wait on new squad leader
                }
                this.flee();
            }
        }
    }
}
