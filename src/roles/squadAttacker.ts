import { posFromMem } from '../modules/memoryManagement';
import { Pathing } from '../modules/pathing';
import { SquadManagement } from '../modules/squadManagement';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
    protected run() {
        // --- QUADS
        let fleeing = false;
        if (SquadManagement.isPartOfQuad(this)) {
            if (SquadManagement.missingQuadCreep(this)) {
                SquadManagement.setupQuad(this);
                SquadManagement.fleeing(this);
                fleeing = true;
            }

            const squadLeader = SquadManagement.getSquadLeader(this);
            const range = this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
            let enemyStructId: Id<Structure>;
            if (!fleeing && !SquadManagement.closeToTargetRoom(squadLeader) && squadLeader.pos.roomName !== squadLeader.memory.assignment) {
                if (this.onEdge() || SquadManagement.getInLineFormation(this)) {
                    SquadManagement.linePathing(this);
                }
            } else {
                if (!fleeing) {
                    if (this.onEdge() || SquadManagement.getIntoFormation(this)) {
                        SquadManagement.formationPathing(this, range);
                    } else {
                        // Not in formation TODO: remove once formation doesnt break anymore
                        const hostile = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
                        this.memory.targetId = hostile.id;
                    }
                }
            }

            if (!Game.getObjectById(this.memory.targetId)) {
                delete this.memory.targetId;
            }

            // No target for second leader
            this.attackTarget(range, this.memory.targetId as Id<Structure>);
            return;
        }

        // --- SQUADS
        if (SquadManagement.missingDuoCreep(this)) {
            SquadManagement.setupDuo(this);
            SquadManagement.fleeing(this);
            fleeing = true;
        }

        if (!fleeing && !this.onEdge() && !SquadManagement.getInDuoFormation(this)) {
            return; // Wait for follower to get closer
        }
        const range = this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
        let enemyStructId: Id<Structure>;
        if (!fleeing && this.memory.combat.forcedDestinations?.length) {
            let nextDestination = this.memory.combat.forcedDestinations[0];
            if (this.pos.toMemSafe() === nextDestination) {
                this.memory.combat.forcedDestinations = this.memory.combat.forcedDestinations.slice(1);
                nextDestination = this.memory.combat.forcedDestinations[0];
            }
            this.travelTo(posFromMem(nextDestination));
        } else if (!fleeing && this.travelToRoom(this.memory.assignment) === IN_ROOM) {
            enemyStructId = this.combatPath(range);
        }
        this.attackTarget(range, enemyStructId);
    }

    private attackTarget(range: number, enemyStructId: Id<Structure>) {
        const targetId = this.findTarget(range, enemyStructId);
        if (targetId) {
            const target = Game.getObjectById(targetId);
            if (target instanceof Creep) {
                this.attackCreep(target);
            } else if (target instanceof Structure) {
                this.attackStructure(target);
            }
        }
    }

    /**
     * Travel directly to priority enemy structures.
     * TODO: look for my own creeps so I can send two squads
     *
     * @returns nextPosition to travelTo
     */
    private combatPath(range: number): Id<Structure> {
        if (this.memory._m.path) {
            const nextDirection = this.memory._m.path[0];
            const nextPosition = Pathing.positionAtDirection(this.pos, parseInt(nextDirection, 10) as DirectionConstant);
            const enemyStructure = this.room.lookForAt(LOOK_STRUCTURES, nextPosition);
            if (enemyStructure.length) {
                return enemyStructure[0].id; // Do not move before structure is destroyed
            }
        }

        let target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType === STRUCTURE_TOWER }) as any;
        if (!target) {
            target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType === STRUCTURE_SPAWN });
        }
        if (!target) {
            target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        }
        if (!target) {
            target = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
        }

        if (target instanceof Creep) {
            this.travelTo(target, { range: range });
            return;
        }
        this.travelTo(target, { range: 1, ignoreStructures: true });
    }

    /**
     * Check if any enemy creeps are around that are not standing on ramparts.
     * If so prioritize them. Otherwise simply get rid of the structure that is in the way.
     *
     * @returns
     */
    private findTarget(range: number, enemyStruct: Id<Structure>): Id<Creep> | Id<Structure> {
        const areaInRange = Pathing.getArea(this.pos, range);
        const unprotectedHostileCreep = this.room
            .lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true)
            .filter(
                (lookObject) =>
                    lookObject.type === LOOK_CREEPS &&
                    lookObject.creep?.owner?.username !== this.owner.username &&
                    lookObject.structure?.structureType !== STRUCTURE_RAMPART
            );

        if (unprotectedHostileCreep.length) {
            return unprotectedHostileCreep[0].creep.id;
        }

        return enemyStruct;
    }
}
