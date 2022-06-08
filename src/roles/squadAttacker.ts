import { posFromMem } from '../modules/memoryManagement';
import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
    protected run() {
        const squadFollower = this.memory.combat.squadFollower ? Game.getObjectById(this.memory.combat.squadFollower) : undefined;

        if (squadFollower) {
            if (!this.onEdge(this.pos) && !this.pos.isNearTo(squadFollower)) {
                return; // Wait for follower to get closer
            }
            const range = this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
            if (this.memory.combat.forcedDestinations?.length) {
                let nextDestination = this.memory.combat.forcedDestinations[0];
                if (this.pos.toMemSafe() === nextDestination) {
                    this.memory.combat.forcedDestinations = this.memory.combat.forcedDestinations.slice(1);
                    nextDestination = this.memory.combat.forcedDestinations[0];
                }
                this.travelTo(posFromMem(nextDestination));
            } else if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
                const enemyStructId = this.combatPath(range);
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
        } else {
            const newSquadFollower = this.room.creeps.find(
                (creep) => creep.memory.role === Role.SQUAD_HEALER && creep.memory.assignment === this.memory.assignment
            );
            if (newSquadFollower) {
                this.memory.combat.squadFollower = newSquadFollower.id;
            } else {
                if (this.pos.roomName !== this.memory.assignment) {
                    this.moveOffExit();
                    return; // Wait on new squad follower
                }
                this.flee();
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
