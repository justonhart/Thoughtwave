export class CombatIntel {
    private static towerMaxRange = 20;
    private static towerMinRange = 5;
    private static towerMaxDmg = 600;
    private static towerMinDmg = 150;
    private static towerMaxHeal = 400;
    private static towerMinHeal = 100;

    /**
     * Get tower combat data by room.
     * @param room Targetroom
     * @param forHostile Get hostile or own tower combat data
     * @param pos Optional roomPosition for which to calculate the combat data
     * @returns
     */
    public static getTowerCombatData(room: Room, forHostile: boolean, pos?: RoomPosition): TowerCombatData {
        const towers = room.find(forHostile ? FIND_HOSTILE_STRUCTURES : FIND_MY_STRUCTURES, {
            filter: (struct) => struct.structureType === STRUCTURE_TOWER,
        }) as StructureTower[];

        if (!towers) {
            return;
        }

        let combatData: TowerCombatData = {
            minDmg: towers.length * this.towerMinDmg,
            maxDmg: towers.length * this.towerMaxDmg,
            minHeal: towers.length * this.towerMinHeal,
            maxHeal: towers.length * this.towerMaxHeal,
        };

        if (!pos) {
            return combatData;
        }

        combatData.dmgAtPos = this.calculateTotal(towers, pos, this.towerMinDmg, this.towerMaxDmg);
        combatData.healAtPos = this.calculateTotal(towers, pos, this.towerMinHeal, this.towerMaxHeal);
        return combatData;
    }

    /**
     * Calculate total amount of damage enemy creeps can do (to creeps and structures).
     * This will not include already destroyed body parts.
     * @param room
     * @param pos
     * @returns
     */
    public static getCreepCombatData(room: Room, forHostile: boolean, pos?: RoomPosition): CreepCombatData {
        const hostileCreeps = room.find(forHostile ? FIND_HOSTILE_CREEPS : FIND_MY_CREEPS, {
            filter: (creep: Creep) =>
                (!Memory.empire.playersToIgnore?.includes(creep.owner.username) && creep.getActiveBodyparts(RANGED_ATTACK)) ||
                creep.getActiveBodyparts(ATTACK) ||
                creep.getActiveBodyparts(HEAL),
        }) as Creep[];

        if (!hostileCreeps) {
            return;
        }

        if (!pos) {
            return this.calculateCreepsCombatData(hostileCreeps);
        }

        return this.calculateCreepsCombatData(hostileCreeps, pos);
    }

    /**
     * Calculate total Tower Damage based on range instead of a specific RoomPosition.
     * @param combatData CombatData calculated by getTowerCombatData
     * @param range targetRange
     * @returns Damage at specified range
     */
    public static towerDamageAtRange(combatData: TowerCombatData, range: number): number {
        const interval = (this.towerMaxDmg - this.towerMinDmg) / (this.towerMaxRange - this.towerMinRange); // Damage diff between ranges
        if (range >= this.towerMaxRange) {
            return combatData.minDmg;
        } else if (range <= this.towerMinRange) {
            return combatData.maxDmg;
        }
        return combatData.maxDmg - (range - this.towerMinRange) * interval;
    }

    /**
     * Calculate total Dmg/Heal from all towers at the specified position.
     * @param towers own/hostile towers
     * @param pos target roomposition
     * @param min dmg/heal minimum
     * @param max dmg/heal maximum
     * @returns dmg/heal at pos
     */
    private static calculateTotal(towers: StructureTower[], pos: RoomPosition, min: number, max: number): number {
        const interval = (max - min) / (this.towerMaxRange - this.towerMinRange); // Damage diff between ranges
        return towers.reduce((totalDamage, nextTower) => {
            const range = nextTower.pos.getRangeTo(pos);

            if (range >= this.towerMaxRange) {
                return min;
            } else if (range <= this.towerMinRange) {
                return max;
            }
            return (totalDamage += max - (range - this.towerMinRange) * interval);
        }, 0);
    }

    /**
     * This will always assume single target damage (max damage) and not rangedMassAttack.
     * @param creeps
     * @param pos
     * @returns
     */
    private static calculateCreepsCombatData(creeps: Creep[], pos?: RoomPosition): CreepCombatData {
        let combatData = { totalDmg: 0, attack: 0, ranged: 0, heal: 0, dmgMultiplier: 1, count: creeps.length };
        creeps.forEach((creep: Creep) => {
            combatData = this.getTotalDamagePerCreepBody(creep.body, combatData);
            if (pos) {
                const range = creep.pos.getRangeTo(pos);
                if (range === 1) {
                    combatData.totalDmg += combatData.attack;
                }
                if (range <= 3) {
                    combatData.totalDmg += combatData.ranged;
                }
            } else {
                combatData.totalDmg += combatData.attack + combatData.ranged;
            }
        });
        return combatData;
    }

    /**
     * This will calculate the total Damage from ranged and normal attack. It will also check if the body part is boosted or already broken.
     * @param bodyParts
     * @param targetBodyPart
     * @returns
     */
    private static getTotalDamagePerCreepBody(bodyParts: BodyPartDefinition[], combatData: CreepCombatData): CreepCombatData {
        bodyParts
            .filter(
                (bodyPart: BodyPartDefinition) =>
                    (bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === HEAL) && bodyPart.hits
            )
            .forEach((bodyPart: BodyPartDefinition) => {
                let boost = 1;
                if (bodyPart.type === ATTACK) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.attack[bodyPart.boost].attack;
                    }
                    combatData.attack += 30 * boost;
                } else if (bodyPart.type === RANGED_ATTACK) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.ranged_attack[bodyPart.boost].rangedAttack;
                    }
                    combatData.ranged += 30 * boost;
                } else if (bodyPart.type === HEAL) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.heal[bodyPart.boost].heal;
                    }
                    combatData.heal += 12 * boost;
                } else if (bodyPart.type === TOUGH) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.tough[bodyPart.boost].damage;
                    }
                    // Set the highest boost since the damage needs to exceed this
                    if (combatData.dmgMultiplier > boost) {
                        combatData.dmgMultiplier = boost;
                    }
                }
            });
        return combatData;
    }
}
