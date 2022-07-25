import { CombatCreep } from '../virtualCreeps/combatCreep';

export class KeeperExterminator extends CombatCreep {
    private shouldRangedHeal: boolean = false;
    protected run() {
        if (this.room.name === this.memory.assignment || this.memory.targetId) {
            let target = Game.getObjectById(this.memory.targetId);
            if (!target) {
                this.memory.targetId = this.findNextKeeper();
                target = Game.getObjectById(this.memory.targetId);
            }

            if (target) {
                if (this.pos.isNearTo(target)) {
                    this.attackCreep(target as Creep);
                    this.shouldRangedHeal = true;
                } else {
                    this.travelTo(target, { range: 1, avoidSourceKeepers: false });
                }
            }

            if (this.shouldRangedHeal) {
                this.rangedHeal(this);
            } else {
                this.heal(this);
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findNextKeeper(): Id<Creep> {
        let keepers = Game.rooms[this.memory.assignment].find(FIND_HOSTILE_CREEPS, { filter: (c) => c.owner.username === 'Source Keeper' });
        if (keepers.length) {
            return this.pos.findClosestByPath(keepers)?.id;
        }
    }
}
