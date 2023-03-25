import { CombatIntel } from '../modules/combatIntel';
import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class RampartProtector extends CombatCreep {
    protected run() {
        if ((this.hits < this.hitsMax || this.memory.targetId) && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }

        // TODO: change this to not stop if already attacked (doesnt matter now since no move boost)
        if (this.memory.stop) {
            delete this.memory.stop;
            return;
        }

        if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
            // Assasination
            if (this.memory.ready >= 5) {
                const targetCreep = Game.getObjectById(this.memory.targetId2);
                const secondProtector = Object.values(Game.creeps).find(
                    (creep) => creep.id !== this.id && creep.room.name === this.room.name && creep.pos.isNearTo(targetCreep)
                ) as RampartProtector;
                if (targetCreep && secondProtector) {
                    secondProtector.memory.ready = 0;
                    if (this.pos.isNearTo(targetCreep) && secondProtector.pos.isNearTo(targetCreep)) {
                        secondProtector.memory.stop = true;
                        this.attack(targetCreep);
                        secondProtector.attack(targetCreep);
                        this.pathingToRampart(this, Game.getObjectById(this.memory.targetId) as StructureRampart);
                        this.pathingToRampart(secondProtector, Game.getObjectById(this.memory.targetId) as StructureRampart);
                    }
                }
                this.memory.ready = 0;
                return;
            }

            // First find the targetedRampart. If none is present (for example gcl < 4), then find the hostileCreep
            const hostileCreepId = this.findTarget();
            this.memory.targetId2 = hostileCreepId;

            this.memory.targetId = this.getTargetedRampart(hostileCreepId);

            if (!this.memory.targetId) {
                this.memory.targetId = hostileCreepId;
            }
            if (!this.memory.targetId) {
                this.memory.currentTaskPriority = Priority.LOW;
                return;
            }
            this.memory.currentTaskPriority = Priority.HIGH;
            const target = Game.getObjectById(this.memory.targetId);
            let creepActionReturnCode: CreepActionReturnCode;
            if (target instanceof StructureRampart) {
                let targetCreep = Game.getObjectById(hostileCreepId);
                if (!this.pos.isNearTo(targetCreep)) {
                    const nearCreep = this.room
                        .lookForAtArea(LOOK_CREEPS, this.pos.y - 1, this.pos.x - 1, this.pos.y + 1, this.pos.x + 1, true)
                        .filter((lookObject) => !lookObject.creep.my);
                    if (nearCreep.length) {
                        targetCreep = nearCreep[0].creep;
                    }
                }
                // Check for close Creeps to move toward and assasinate
                if (
                    targetCreep &&
                    this.hits === this.hitsMax &&
                    this.ticksToLive > 7 &&
                    Pathing.sameCoord(this.pos, target.pos) &&
                    !Object.values(Game.creeps).some(
                        (creep) => creep.id !== this.id && creep.memory.targetId2 === this.memory.targetId2 && creep.memory.ready > 0
                    ) &&
                    !targetCreep.getActiveBodyparts(ATTACK) &&
                    !this.fatigue &&
                    this.pos.getRangeTo(targetCreep) === 2
                ) {
                    if (this.memory.ready === undefined) {
                        this.memory.ready = 0;
                    }
                    this.memory.ready++;

                    if (this.memory.ready >= 3) {
                        const secondProtector = Object.values(Game.creeps).find(
                            (creep) =>
                                creep.id !== this.id &&
                                creep.room.name === this.room.name &&
                                creep.ticksToLive > 5 &&
                                creep.pos.getRangeTo(targetCreep) === 2 &&
                                !creep.fatigue &&
                                creep.hits === creep.hitsMax
                        ) as RampartProtector;
                        if (secondProtector && !this.canKill(targetCreep.pos, this, secondProtector)) {
                            this.memory.ready = 0;
                        }
                        if (secondProtector) {
                            secondProtector.memory.stop = true;
                        }
                        if (secondProtector && this.memory.ready >= 4) {
                            const directionToEnemy = this.pos.getDirectionTo(targetCreep);
                            const direction = secondProtector.pos.getDirectionTo(targetCreep);
                            if (
                                !Pathing.sameCoord(
                                    Pathing.positionAtDirection(this.pos, directionToEnemy),
                                    Pathing.positionAtDirection(secondProtector.pos, secondProtector.pos.getDirectionTo(targetCreep))
                                )
                            ) {
                                let survive = true;
                                survive = this.canSurvive(Pathing.positionAtDirection(this.pos, directionToEnemy));
                                survive = this.canSurvive(
                                    Pathing.positionAtDirection(secondProtector.pos, secondProtector.pos.getDirectionTo(targetCreep))
                                );
                                if (!survive || Object.values(Game.creeps).some((creep) => creep.id !== this.id && creep.memory.ready >= 4)) {
                                    this.memory.ready = 0;
                                    return;
                                }
                                this.memory.ready++;
                                this.move(directionToEnemy);
                                secondProtector.move(direction);
                                secondProtector.memory.targetId2 = this.memory.targetId2;
                                return;
                            } else if (
                                Pathing.positionAtDirection(
                                    this.pos,
                                    (directionToEnemy + 1 === 9 ? 1 : directionToEnemy + 1) as DirectionConstant
                                ).getRangeTo(targetCreep) === 1
                            ) {
                                let survive = true;
                                survive = this.canSurvive(Pathing.positionAtDirection(this.pos, directionToEnemy));
                                survive = this.canSurvive(
                                    Pathing.positionAtDirection(
                                        this.pos,
                                        (directionToEnemy + 1 === 9 ? 1 : directionToEnemy + 1) as DirectionConstant
                                    )
                                );
                                if (!survive || Object.values(Game.creeps).some((creep) => creep.id !== this.id && creep.memory.ready >= 4)) {
                                    this.memory.ready = 0;
                                    return;
                                }
                                this.memory.ready++;
                                this.move(directionToEnemy + 1 === 9 ? 1 : ((directionToEnemy + 1) as DirectionConstant));
                                secondProtector.move(direction);
                                secondProtector.memory.targetId2 = this.memory.targetId2;
                                return;
                            } else if (
                                Pathing.positionAtDirection(
                                    this.pos,
                                    (directionToEnemy - 1 === 0 ? 8 : directionToEnemy - 1) as DirectionConstant
                                ).getRangeTo(targetCreep) === 1
                            ) {
                                let survive = true;
                                survive = this.canSurvive(Pathing.positionAtDirection(this.pos, directionToEnemy));
                                survive = this.canSurvive(
                                    Pathing.positionAtDirection(
                                        this.pos,
                                        (directionToEnemy - 1 === 0 ? 8 : directionToEnemy - 1) as DirectionConstant
                                    )
                                );
                                if (!survive || Object.values(Game.creeps).some((creep) => creep.id !== this.id && creep.memory.ready >= 4)) {
                                    this.memory.ready = 0;
                                    return;
                                }
                                this.memory.ready++;
                                this.move(directionToEnemy - 1 === 0 ? 8 : ((directionToEnemy - 1) as DirectionConstant));
                                secondProtector.move(direction);
                                secondProtector.memory.targetId2 = this.memory.targetId2;
                                return;
                            }
                        } else if (!secondProtector) {
                            this.memory.ready = 0;
                        }
                    }
                } else {
                    this.memory.ready = 0;
                }

                this.pathingToRampart(this, target);
                creepActionReturnCode = this.attackCreep(targetCreep);
                if (this.pos.getRangeTo(targetCreep) > 1) {
                    creepActionReturnCode = ERR_NOT_IN_RANGE; // Creep should always reevaluate for closest rampart if there is no enemy creep in the vicinity (squads sometimes move to other parts that are only 2 blocks away so ranged will only attack one creep otherwise)
                }
            } else if (target instanceof Creep) {
                this.combatPathing(target);
                creepActionReturnCode = this.attackCreep(target);
            }

            if (Game.flags.dot) {
                const creeps = this.room.lookForAt(LOOK_CREEPS, Game.flags.dot.pos.x, Game.flags.dot.pos.y);
                if (creeps.length) {
                    this.attackCreep(creeps[0]);
                }
            }
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
        const alreadyTargeted = this.room.creeps
            .filter((creep) => creep.id !== this.id && creep.memory.role === Role.RAMPART_PROTECTOR)
            .map((creep) => creep.memory.targetId2);
        alreadyTargeted.forEach((targetId) => {
            squads = squads.filter((squad) => !squad.some((squadCreepId) => squadCreepId === targetId));
        });

        let hostileCreeps = this.room
            .find(FIND_HOSTILE_CREEPS)
            .filter(
                (creep: Creep) =>
                    creep.body.some(
                        (bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK || bodyPart.type === WORK || bodyPart.type === HEAL
                    ) && squads.some((squad) => squad.some((squadCreepId) => squadCreepId === creep.id))
            );

        // If all squads are covered double team up
        if (!hostileCreeps.length) {
            const otherProtectors = Object.values(Game.creeps).filter(
                (creep) =>
                    this.id !== creep.id &&
                    creep.memory.role === Role.RAMPART_PROTECTOR &&
                    creep.memory.room === this.memory.room &&
                    Game.getObjectById(creep.memory.targetId2)?.pos?.roomName === this.room.name
            );

            if (otherProtectors.length) {
                // If in range to assasinate enemy creep
                const closestCreeps = this.room
                    .find(FIND_HOSTILE_CREEPS)
                    .filter(
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
                const enemyTargetIds = otherProtectors.map((protector) => protector.memory.targetId2);
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
        return this.room
            .find(FIND_HOSTILE_CREEPS)
            .find((creep: Creep) =>
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
            const myRamparts = this.room
                .find(FIND_STRUCTURES)
                .filter(
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
                            !Object.values(Game.creeps).some((creep) => creep.id !== this.id && creep.memory.targetId === rampart.id)
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
