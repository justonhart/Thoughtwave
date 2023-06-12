import { CombatIntel } from '../modules/combatIntel';
import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class RampartProtector extends CombatCreep {
    protected run() {
        if ((this.damaged() || this.memory.targetId) && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }

        // Move to targetRoom
        if (this.memory.assignment && this.travelToRoom(this.memory.assignment) !== IN_ROOM) {
            return;
        }

        // Attack a specific target
        let targetCreep = Game.getObjectById((this.memory as RampartProtectorMemory).targetId);
        if (targetCreep) {
            this.attackCreep(targetCreep);
        } else {
            targetCreep = this.findWeakestCreepInRange();
            if (targetCreep) {
                this.attack(targetCreep);
            }
        }

        // Travel to target position (usually a rampart)
        const targetPos = (this.memory as RampartProtectorMemory).targetPos;
        if (targetPos) {
            const target = targetPos.toRoomPos();
            if (!this.pos.isEqualTo(target)) {
                this.travelTo(target);
            }
        } else {
            this.combatPathing(targetCreep);
        }
    }

    /**
     * Find the weakest Creep in range
     * @returns
     */
    private findWeakestCreepInRange(): Creep {
        const hostileCreepsInRange = this.room.hostileCreeps.filter((hostileCreep) => this.pos.isNearTo(hostileCreep));
        if (hostileCreepsInRange?.length === 1) {
            return hostileCreepsInRange[0];
        } else if (hostileCreepsInRange?.length > 1) {
            // Attack weakest Creep in range
            const combatIntelMe = CombatIntel.getCreepCombatData(this.room, false, this.pos);
            const combatIntelEnemy = CombatIntel.getCreepCombatData(this.room, true, hostileCreepsInRange[0].pos);
            let predictedDamage = CombatIntel.getPredictedDamage(
                combatIntelMe.totalRanged,
                combatIntelEnemy.highestDmgMultiplier,
                combatIntelEnemy.highestToughHits
            );
            return hostileCreepsInRange.reduce(
                (weakestCreepInfo, nextCreep) => {
                    const combatIntelEnemy = CombatIntel.getCreepCombatData(this.room, true, nextCreep.pos);
                    predictedDamage = CombatIntel.getPredictedDamage(
                        combatIntelMe.totalRanged,
                        combatIntelEnemy.highestDmgMultiplier,
                        combatIntelEnemy.highestToughHits
                    );
                    if (weakestCreepInfo.predictedDamage < predictedDamage) {
                        return { creep: nextCreep, predictedDamage: predictedDamage };
                    }

                    return weakestCreepInfo;
                },
                { creep: hostileCreepsInRange[0], predictedDamage: predictedDamage }
            ).creep;
        }
    }

    /**
     * Check if creep can survive for 2 ticks
     * @param pos
     */
    private canSurvive(pos: RoomPosition) {
        const hostileCreepInfo = CombatIntel.getCreepCombatData(this.room, true, pos);
        const towerHeal = CombatIntel.getTowerCombatData(this.room, false, pos).healAtPos;

        return 3 * (hostileCreepInfo.totalDmg - towerHeal) < 4000;
    }

    private canKill(pos: RoomPosition, creep1: Creep, creep2: Creep) {
        const enemy = CombatIntel.getCreepCombatData(this.room, true, pos);
        const towerDmg = CombatIntel.getTowerCombatData(this.room, false, pos).dmgAtPos;

        // TODO: Technically only count self heal and subtract own creep damage by one tick of enemy damage since they first have to move into place
        return (
            enemy.highestHP + CombatIntel.getPredictedDamageNeeded(enemy.totalHeal / 1.5, enemy.highestDmgMultiplier, enemy.highestToughHits) <
            towerDmg + CombatIntel.getTotalDamagePerCreepBody(creep1.body).attack + CombatIntel.getTotalDamagePerCreepBody(creep2.body).attack
        );
    }

    private pathingToRampart(creep: Creep, targetRampart: StructureRampart) {
        // Already at target
        if (!targetRampart || Pathing.sameCoord(creep.pos, targetRampart.pos)) {
            return;
        }

        creep.travelTo(targetRampart, {
            preferRamparts: true,
            efficiency: 0.2,
            maxRooms: 1,
            noPush: creep.memory.currentTaskPriority,
            avoidEdges: true,
        });
    }

    private findTarget(): Id<Creep> {
        let squads = this.identifySquads();
        const alreadyTargeted = this.room.myCreeps
            .filter((creep) => creep.id !== this.id && creep.memory.role === Role.RAMPART_PROTECTOR)
            .map((creep) => creep.memory.targetId2);
        alreadyTargeted.forEach((targetId) => {
            squads = squads.filter((squad) => !squad.some((squadCreepId) => squadCreepId === targetId));
        });

        let hostileCreeps = this.room.hostileCreeps.filter(
            (creep: Creep) =>
                creep.body.some(
                    (bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK || bodyPart.type === HEAL
                ) && squads.some((squad) => squad.some((squadCreepId) => squadCreepId === creep.id))
        );

        // If all squads are covered double team up
        if (!hostileCreeps.length) {
            const otherProtectors = this.room.myCreeps.filter(
                (creep) =>
                    this.id !== creep.id &&
                    creep.memory.role === Role.RAMPART_PROTECTOR &&
                    Game.getObjectById(creep.memory.targetId2)?.pos?.roomName === this.room.name
            );

            if (otherProtectors.length) {
                // If in range to assasinate enemy creep
                const closestCreeps = this.room.hostileCreeps.filter(
                    (creep: Creep) =>
                        creep.body.some(
                            (bodyPart) =>
                                bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK || bodyPart.type === HEAL
                        ) &&
                        creep.pos.getRangeTo(this) <= 2 &&
                        creep.ticksToLive > 30
                );
                if (closestCreeps.length) {
                    let closestProtector;
                    const creepInRange = closestCreeps.find((hostileCreep) =>
                        otherProtectors.find((protector) => {
                            if (protector.pos.getRangeTo(hostileCreep) <= 2) {
                                closestProtector = protector;
                                return true;
                            }
                            return false;
                        })
                    );
                    if (creepInRange && closestProtector) {
                        if (closestProtector.memory) {
                            closestProtector.memory.targetId2 = creepInRange.id;
                        }
                        return creepInRange.id;
                    }
                }

                // Find an enemy that is only targeted by one protector
                const enemyTargetIds = otherProtectors.map((protector) => protector.memory.targetId2 as Id<Creep>);
                const enemyWithOnlyOneProtector = enemyTargetIds.find(
                    (targetId) => enemyTargetIds.indexOf(targetId) === enemyTargetIds.lastIndexOf(targetId)
                );
                if (enemyWithOnlyOneProtector) {
                    return enemyWithOnlyOneProtector;
                }
            }
        } else {
            // TODO: closest to rampart instead?
            const closestDangerousHostile = this.pos.findClosestByRange(hostileCreeps);
            if (closestDangerousHostile) {
                return closestDangerousHostile.id;
            }
        }

        // Shouldn't be needed but just in case nothing matched up
        return this.room.hostileCreeps.find((creep: Creep) =>
            creep.body.some(
                (bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK || bodyPart.type === HEAL
            )
        )?.id;
    }

    /**
     * Check all ramparts to find the one that is being attacked and does not yet have a defender
     * @returns
     */
    private getTargetedRampart(hostileCreepId: Id<Creep>): Id<StructureRampart> {
        if (hostileCreepId) {
            const myRamparts = this.room.structures.filter(
                (structure) =>
                    structure.structureType === STRUCTURE_RAMPART && this.room.memory.miningAssignments[structure.pos.toMemSafe()] === undefined
            ) as StructureRampart[];

            if (myRamparts.length) {
                const closestHostile = Game.getObjectById(hostileCreepId);
                let closestRampartToHostile = myRamparts.find((rampart) => Pathing.sameCoord(rampart.pos, this.pos));

                myRamparts
                    .filter(
                        (rampart) =>
                            !rampart.pos.lookFor(LOOK_CREEPS).some((creep) => creep.memory.role === Role.RAMPART_PROTECTOR) &&
                            !this.room.myCreeps.some((creep) => creep.id !== this.id && creep.memory.targetId === rampart.id)
                    )
                    .forEach((emptyRamparts) => {
                        // Find closest rampart and prefer the ones that are in front of the enemy creep
                        if (
                            !closestRampartToHostile ||
                            emptyRamparts.pos.getRangeTo(closestHostile.pos) < closestRampartToHostile.pos.getRangeTo(closestHostile.pos) ||
                            (this.pos.getDirectionTo(closestHostile.pos) % 2 === 0 &&
                                emptyRamparts.pos.getRangeTo(closestHostile.pos) === closestRampartToHostile.pos.getRangeTo(closestHostile.pos) &&
                                emptyRamparts.pos.getDirectionTo(closestHostile.pos) % 2 === 1)
                        ) {
                            closestRampartToHostile = emptyRamparts;
                        }
                    });

                if (closestRampartToHostile) {
                    return closestRampartToHostile.id;
                }
            }
        }
    }
}
