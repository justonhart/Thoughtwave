import { WaveCreep } from './waveCreep';

export class CombatCreep extends WaveCreep {
    protected attackTarget() {
        const target = Game.getObjectById(this.memory.targetId);

        if (target instanceof Creep) {
            this.attackCreep(target);
        } else if (target instanceof Structure) {
            this.attackStructure(target);
        }
    }

    protected attackCreep(target: Creep): CreepActionReturnCode {
        if (this.getActiveBodyparts(ATTACK)) {
            this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: 1 });
            return this.attack(target);
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            let range = 3;
            let exitCost = 50;
            let shouldFlee = true;

            const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
            const hostilesInSquadRange = hostileCreeps.filter((creep) => this.pos.getRangeTo(creep.pos) < 7); // 7 because our creep distance is 3 and then a healer can be 3 away from the enemy creep
            const hostilesInRange = hostilesInSquadRange.filter((creep) => this.pos.getRangeTo(creep.pos) < 4); // RangedAttack has a max Distance of 3

            // If not in range or it is an enemy squad then go closer to enable massAttack
            if (this.pos.getRangeTo(target) > range || hostilesInSquadRange.length > 1) {
                range = 1;
                shouldFlee = false;
            }

            if (this.memory.combat.flee) {
                const closestExit = this.pos.findClosestByPath(FIND_EXIT);
                this.travelTo(closestExit, { ignoreCreeps: false });
            } else {
                this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: range, flee: shouldFlee, exitCost: exitCost });
            }
            if (hostilesInRange.length > 1) {
                return this.rangedMassAttack();
            } else {
                return this.rangedAttack(target);
            }
        }
        return ERR_NO_BODYPART;
    }

    protected attackStructure(target: Structure): CreepActionReturnCode {
        this.travelTo(target, { range: 1 });
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
        if (!this.memory.combat.flee && this.hits / this.hitsMax < 0.35 && this.getActiveBodyparts(HEAL)) {
            this.memory.combat.flee = true;
        } else if (this.memory.combat.flee && this.hits / this.hitsMax > 0.8) {
            this.memory.combat.flee = false;
        }
        if (this.memory.combat.flee && this.pos.roomName !== this.memory.assignment) {
            this.moveOffExit(); // TODO: this could be an issue if exit is blocked
            return true; // Creep retreated to previous room to heal
        }
        return false;
    }

    public findTarget() {
        const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
        if (hostileCreeps.length) {
            const healers = hostileCreeps.filter((creep) => creep.getActiveBodyparts(HEAL) > 0);

            return healers.length ? this.pos.findClosestByRange(healers).id : this.pos.findClosestByRange(hostileCreeps).id;
        }
        const hostileRamparts = this.room.find(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_RAMPART });
        if (hostileRamparts.length) {
            return hostileRamparts[0].id;
        }

        const hostileStructures = this.room
            .find(FIND_HOSTILE_STRUCTURES)
            .filter((struct) => !(struct.structureType === STRUCTURE_STORAGE && struct.store.getUsedCapacity()));
        if (hostileStructures.length) {
            return hostileStructures[0].id;
        }
    }
}
