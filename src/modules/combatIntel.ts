export class CombatIntel {
    private static towerMaxRange = 20;
    private static towerMinRange = 5;
    private static towerMaxDmg = 600;
    private static towerMinDmg = 150;
    public static towerMaxHeal = 400;
    public static towerMinHeal = 100;

    /**
     * Calculate actual damage done against creeps with tough parts
     * @param damage
     * @param damageMultiplier
     * @param toughHits
     * @returns
     */
    public static getPredictedDamage(damage: number, damageMultiplier: number, toughHits: number): number {
        if (damage * damageMultiplier < toughHits) {
            // Damage is not enough to go through all of the tough parts
            return damage * damageMultiplier;
        } else {
            // Damage exceeds tough parts
            damage -= toughHits / damageMultiplier;
            return toughHits + damage;
        }
    }

    /**
     * Calculate actual damage needed against creeps with tough parts
     * @param damageNeeded
     * @param damageMultiplier
     * @param toughHits
     * @returns
     */
    public static getPredictedDamageNeeded(damageNeeded: number, damageMultiplier: number, toughHits: number): number {
        if (damageMultiplier === 1 || damageNeeded === 0) {
            return damageNeeded;
        }
        // Damage will break through tough parts
        if (damageNeeded > toughHits / damageMultiplier) {
            return damageNeeded + toughHits / damageMultiplier;
        }
        return damageNeeded / damageMultiplier;
    }

    /**
     * Get tower combat data by room.
     * @param room Targetroom
     * @param forHostile Get hostile or own tower combat data
     * @param pos Optional roomPosition for which to calculate the combat data
     * @returns
     */
    public static getTowerCombatData(room: Room, forHostile: boolean, pos?: RoomPosition): TowerCombatData {
        let towers: StructureTower[] = forHostile
            ? (room.hostileStructures.filter((struct) => struct.structureType === STRUCTURE_TOWER) as StructureTower[])
            : (room.myStructures.filter((struct) => struct.structureType === STRUCTURE_TOWER) as StructureTower[]);

        if (!towers) {
            return { minDmg: 0, maxDmg: 0, minHeal: 0, maxHeal: 0 };
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
    public static getCreepCombatData(room: Room, forHostile: boolean, pos?: RoomPosition): RoomCreepsCombatData {
        const creeps: Creep[] = forHostile
            ? room.hostileCreeps.filter(
                  (creep: Creep) =>
                      !Memory.playersToIgnore?.includes(creep.owner.username) &&
                      creep.owner.username !== 'Source Keeper' &&
                      (creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(HEAL))
              )
            : room.myCreeps.filter(
                  (creep) => creep.getActiveBodyparts(RANGED_ATTACK) || creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(HEAL)
              );

        if (!pos) {
            return this.calculateCreepsCombatData(creeps);
        }

        return this.calculateCreepsCombatData(creeps, pos);
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
    public static calculateTotal(towers: StructureTower[], pos: RoomPosition, min: number, max: number): number {
        const interval = (max - min) / (this.towerMaxRange - this.towerMinRange); // Damage diff between ranges
        return towers.reduce((totalAmount, nextTower) => {
            // Power Action
            const powerLevel = this.getTowerPowerLevel(nextTower);
            const range = nextTower.pos.getRangeTo(pos);

            if (range >= this.towerMaxRange) {
                return (totalAmount += min * powerLevel);
            } else if (range <= this.towerMinRange) {
                return (totalAmount += max * powerLevel);
            }
            return (totalAmount += max - (range - this.towerMinRange) * interval) * powerLevel;
        }, 0);
    }

    /**
     * This will always assume single target damage (max damage) and not rangedMassAttack.
     * @param creeps
     * @param pos
     * @returns
     */
    public static calculateCreepsCombatData(creeps: Creep[], pos?: RoomPosition): RoomCreepsCombatData {
        let roomCreepsCombatData = {
            totalDmg: 0,
            totalAttack: 0,
            totalRanged: 0,
            totalHeal: 0,
            highestHP: 0,
            highestDmgMultiplier: 1,
            highestToughHits: 0,
            creeps: [],
        };
        creeps.map((creep: Creep) => {
            const combatData = this.getTotalDamagePerCreepBody(creep.body);
            roomCreepsCombatData.creeps.push(combatData);

            if (pos) {
                const range = creep.pos.getRangeTo(pos);
                if (range <= 1) {
                    roomCreepsCombatData.totalDmg += combatData.attack;
                    roomCreepsCombatData.totalAttack += combatData.attack;
                    roomCreepsCombatData.totalHeal += combatData.heal;
                    if (range === 0) {
                        roomCreepsCombatData.highestDmgMultiplier = combatData.dmgMultiplier;
                        roomCreepsCombatData.highestToughHits = combatData.toughHits;
                        roomCreepsCombatData.highestHP = creep.body.length * 100;
                    }
                }
                if (range <= 3) {
                    roomCreepsCombatData.totalDmg += combatData.ranged;
                    roomCreepsCombatData.totalRanged += combatData.ranged;
                    if (range > 1) {
                        roomCreepsCombatData.totalHeal += combatData.heal / 3; // Ranged Heal
                    }
                }
            } else {
                roomCreepsCombatData.totalDmg += combatData.attack + combatData.ranged;
                roomCreepsCombatData.totalAttack += combatData.attack;
                roomCreepsCombatData.totalRanged += combatData.ranged;
                const creepHP = creep.body.length * 100;
                roomCreepsCombatData.highestHP = creepHP > roomCreepsCombatData.highestHP ? creepHP : roomCreepsCombatData.highestHP;
                roomCreepsCombatData.totalHeal += combatData.heal; // Assume maxHeal
                // Only count tough parts on heal units since they are the once that need to be outdamaged
                if (
                    combatData.heal &&
                    roomCreepsCombatData.highestToughHits / roomCreepsCombatData.highestDmgMultiplier <
                        combatData.toughHits / combatData.dmgMultiplier
                ) {
                    roomCreepsCombatData.highestDmgMultiplier = combatData.dmgMultiplier;
                    roomCreepsCombatData.highestToughHits = combatData.toughHits;
                }
            }
        });
        return roomCreepsCombatData;
    }

    //

    /**
     * This will calculate the total Damage from ranged and normal attack. It will also check if the body part is boosted or already broken.
     * @param bodyParts
     * @param targetBodyPart
     * @returns
     */
    public static getTotalDamagePerCreepBody(bodyParts: BodyPartDefinition[]): CreepCombatData {
        const combatData = { attack: 0, ranged: 0, heal: 0, dmgMultiplier: 1, toughHits: 0 };
        bodyParts
            .filter(
                (bodyPart: BodyPartDefinition) =>
                    (bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === HEAL || bodyPart.type === TOUGH) &&
                    bodyPart.hits
            )
            .forEach((bodyPart: BodyPartDefinition) => {
                let boost = 1;
                if (bodyPart.type === ATTACK) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.attack[bodyPart.boost].attack;
                    }
                    combatData.attack += ATTACK_POWER * boost;
                } else if (bodyPart.type === RANGED_ATTACK) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.ranged_attack[bodyPart.boost].rangedAttack;
                    }
                    combatData.ranged += RANGED_ATTACK_POWER * boost;
                } else if (bodyPart.type === HEAL) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.heal[bodyPart.boost].heal;
                    }
                    combatData.heal += HEAL_POWER * boost;
                } else if (bodyPart.type === TOUGH) {
                    if (bodyPart.boost) {
                        boost = BOOSTS.tough[bodyPart.boost].damage;
                    }

                    combatData.toughHits += 100;
                    // Set the highest boost since the damage needs to exceed this
                    if (combatData.dmgMultiplier > boost) {
                        combatData.dmgMultiplier = boost;
                    }
                }
            });
        return combatData;
    }

    private static getTowerPowerLevel(tower: StructureTower): number {
        let powerLevel = 1;
        tower.effects?.forEach((effect) => {
            if (effect.effect === PWR_DISRUPT_TOWER) {
                powerLevel -= effect.level / 10;
            } else if (effect.effect === PWR_OPERATE_TOWER) {
                powerLevel += effect.level / 10;
            }
        });
        return powerLevel;
    }

    /**
     * Get max dmg if all creeps attack every tick for the rest of their ttl (in memory not room based)
     * @param room
     */
    public static getMaxDmgOverLifetime(creeps: Creep[], ttl?: number): number {
        return creeps
            .filter((creep) => creep.getActiveBodyparts(ATTACK) || creep.getActiveBodyparts(RANGED_ATTACK))
            .reduce(
                (totalDmg, nextCreep) =>
                    (totalDmg +=
                        this.getTotalDamagePerCreepBody(nextCreep.body).attack * (ttl && ttl < nextCreep.ticksToLive ? ttl : nextCreep.ticksToLive)),
                0
            );
    }
}
