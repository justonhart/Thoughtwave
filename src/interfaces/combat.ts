interface CreepCombatData {
    totalDmg: number; // Total damage (ignores attack if not in range)
    attack: number;
    ranged: number;
    heal: number;
    dmgMultiplier: number; // coming from boosted TOUGH (tier 1 ==> 0.7)
    count: number; // Number of creeps in the room
}

interface TowerCombatData {
    minDmg: number;
    maxDmg: number;
    dmgAtPos?: number;
    minHeal: number;
    maxHeal: number;
    healAtPos?: number;
}
