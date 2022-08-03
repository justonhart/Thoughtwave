interface RoomCreepsCombatData {
    totalDmg: number; // Total damage (ignores attack if not in range)
    totalAttack: number;
    totalRanged: number;
    totalHeal: number; // Assumes meleeHeal
    highestDmgMultiplier: number;
    highestToughHits: number;
    highestHP: number;
    creeps: CreepCombatData[];
}

interface CreepCombatData {
    attack: number;
    ranged: number;
    heal: number;
    dmgMultiplier: number; // coming from boosted TOUGH (tier 1 ==> 0.7): Based on the highest TOUGH boost on the creep
    toughHits: number; // number of tough hits so that damage can be properly calculated
}

interface TowerCombatData {
    minDmg: number;
    maxDmg: number;
    dmgAtPos?: number;
    minHeal: number;
    maxHeal: number;
    healAtPos?: number;
}
