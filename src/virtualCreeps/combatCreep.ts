import { WaveCreep } from './waveCreep';

export class CombatCreep extends WaveCreep {
    protected attackCreep(target: Creep): CreepActionReturnCode {
        if (this.getActiveBodyparts(ATTACK)) {
            return this.attack(target);
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            // Can't use nearTo as we want to use MassAttack even if it is not the targetHostileCreep that is near us
            if (
                this.room
                    .lookForAtArea(
                        LOOK_CREEPS,
                        this.pos.y - 1 < 0 ? 0 : this.pos.y - 1,
                        this.pos.x - 1 < 0 ? 0 : this.pos.x - 1,
                        this.pos.y + 1 > 49 ? 49 : this.pos.y + 1,
                        this.pos.x + 1 > 49 ? 49 : this.pos.x + 1,
                        true
                    )
                    .filter((lookObject) => lookObject.creep.owner?.username !== this.owner.username && !lookObject.creep?.spawning).length
            ) {
                return this.rangedMassAttack();
            } else {
                return this.rangedAttack(target);
            }
        }
        return ERR_NO_BODYPART;
    }

    // Info: In homeroom this will not work ==> Shouldnt matter as soon as ramparts are up but otherwise move to spawn?
    // Go back to the exit toward creeps homeroom while avoiding creeps along the way
    public flee() {
        return this.travelToRoom(this.homeroom?.name, { ignoreCreeps: false, avoidSourceKeepers: true });
    }

    protected combatPathing(target: Creep) {
        if (this.memory.combat.flee) {
            this.flee();
        }

        if (this.getActiveBodyparts(ATTACK)) {
            if (this.pos.isNearTo(target) && !target.onEdge()) {
                // Close Range movement to stick to the enemy
                return this.move(this.pos.getDirectionTo(target));
            }
            return this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: 1, maxRooms: 1, exitCost: 10 });
        } else if (this.getActiveBodyparts(RANGED_ATTACK)) {
            let range = 3;
            const exitCost = 10;
            let shouldFlee = true;

            const hostilesInSquadRange = this.room.hostileCreeps.filter((creep) => target.pos.getRangeTo(creep) <= 4); // check around target for proper massAttack pathing
            const rangeToTarget = this.pos.getRangeTo(target);

            // If not in range or a squad without melee creep, then go closer to enable massAttack
            if (
                !(target.getActiveBodyparts(ATTACK) || target.getActiveBodyparts(RANGED_ATTACK)) ||
                rangeToTarget > range ||
                (hostilesInSquadRange.length > 1 && !hostilesInSquadRange.some((creep) => creep.getActiveBodyparts(ATTACK)))
            ) {
                range = 1;
                shouldFlee = false;
            } else if (!target.getActiveBodyparts(ATTACK)) {
                range = 2; // Against other RANGED_ATTACK units to keep them from fleeing
            }
            return this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: range, flee: shouldFlee, exitCost: exitCost });
        }
    }

    protected attackStructure(target: Structure): CreepActionReturnCode {
        if (this.getActiveBodyparts(ATTACK)) {
            return this.attack(target);
        } else if (
            this.getActiveBodyparts(RANGED_ATTACK) &&
            (this.nonMassAttackStructures().includes(target.structureType) || this.pos.getRangeTo(target) > 1)
        ) {
            return this.rangedAttack(target);
        }
        return this.rangedMassAttack();
    }

    protected nonMassAttackStructures(): StructureConstant[] {
        return [STRUCTURE_WALL, STRUCTURE_ROAD, STRUCTURE_CONTAINER];
    }

    /**
     * Flee to a different room to heal.
     *
     * @returns boolean, to see if creep has arrived in new room
     */
    public fledToNewRoom(): boolean {
        if (!this.memory.combat?.flee && this.hits / this.hitsMax < 0.4 && this.getActiveBodyparts(HEAL)) {
            this.memory.combat.flee = true;
        } else if (this.memory.combat?.flee && this.hits / this.hitsMax > 0.95) {
            this.memory.combat.flee = false;
        }
        if (this.memory.combat?.flee && this.pos.roomName !== this.memory.assignment) {
            this.moveOffExit(); // TODO: this could be an issue if exit is blocked
            return true; // Creep retreated to previous room to heal
        }
        return false;
    }

    public identifySquads(): Id<Creep>[][] {
        const hostileCreeps = this.room.hostileCreeps.filter((hostileCreep) =>
            hostileCreep.body.some(
                (bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK || bodyPart.type === HEAL
            )
        );
        const squads: Creep[][] = [];
        hostileCreeps.forEach((hostileCreep) => {
            if (!squads.length) {
                squads.push([hostileCreep]);
            } else {
                let found = false;
                squads.every((squad) => {
                    if (squad.length < 4 && squad.some((squadCreep) => hostileCreep.pos.isNearTo(squadCreep))) {
                        squad.push(hostileCreep);
                        found = true;
                        return false;
                    }
                    return true;
                });
                if (!found) {
                    squads.push([hostileCreep]);
                }
            }
        });
        return squads.map((squad) => squad.map((squadCreep) => squadCreep.id));
    }

    protected healSelf(hasMeleeAttacked: boolean) {
        if (!hasMeleeAttacked && (this.damaged() || this.memory.targetId) && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }
    }

    /**
     * Return fire when getting hit
     * @returns true, if creep has melee attacked
     */
    protected defendSelf(): boolean {
        if (
            this.pos.roomName !== this.homeroom.name &&
            this.damaged() &&
            (this.getActiveBodyparts(ATTACK) || this.getActiveBodyparts(RANGED_ATTACK))
        ) {
            const range = this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
            const enemy = this.room.hostileCreeps.find(
                (creep) => (creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK)) && this.pos.getRangeTo(creep) <= range
            );
            if (enemy) {
                this.attackCreep(enemy);
                return !!this.getActiveBodyparts(ATTACK);
            }
        }
    }

    protected recycleCreep() {
        super.recycleCreep();
        this.healSelf(this.defendSelf());
    }
}
