import { posFromMem } from '../modules/memoryManagement';
import { Pathing } from '../modules/pathing';
import { CombatCreep } from '../virtualCreeps/combatCreep';

export class SquadAttacker extends CombatCreep {
    protected run() {
        const squadFollower = Game.getObjectById(this.memory.combat.squadFollower);

        if (squadFollower && this.pos.isNearTo(squadFollower)) {
            if (this.travelToRoom(this.memory.assignment) === IN_ROOM) {
                const enemyStructId = this.combatPath();
                let range = this.getActiveBodyparts(RANGED_ATTACK) ? 3 : 1;
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
            if (this.pos.roomName !== this.memory.assignment) {
                return; // Wait on new squad leader
            }
            this.flee();
        }
    }

    /**
     * Travel directly to priority enemy structures.
     * TODO: look for my own creeps so I can send two squads
     *
     * @returns nextPosition to travelTo
     */
    private combatPath(): Id<Structure> {
        const pathingOptions = { range: 1, ignoreStructures: true };
        if (this.memory._m.path) {
            const nextDirection = this.memory._m.path.slice(1);
            const nextPosition = Pathing.positionAtDirection(this.pos, parseInt(nextDirection, 10) as DirectionConstant);
            const enemyStructure = this.room.lookForAt(LOOK_STRUCTURES, nextPosition);
            if (enemyStructure.length) {
                return enemyStructure[0].id; // Do not move before structure is destroyed
            }
            this.travelTo(posFromMem(this.memory._m.destination), pathingOptions); // continue on same path
            return;
        }

        const enemyTower = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType === STRUCTURE_TOWER });
        if (enemyTower) {
            this.travelTo(enemyTower, pathingOptions);
            return;
        }

        const enemySpawner = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType === STRUCTURE_SPAWN });
        if (enemySpawner) {
            this.travelTo(enemySpawner, pathingOptions);
            return;
        }

        // Default ==> Optimize later ==> cleanup of enemy creeps should be updated every tick
        const enemyCreep = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if (enemyCreep) {
            this.travelTo(enemyCreep, pathingOptions);
            return;
        }

        const enemyStructure = this.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
        if (enemyStructure) {
            this.travelTo(enemyStructure, pathingOptions);
            return;
        }
    }

    /**
     *
     * 1. Find direct Path to tower or spawn if there are no towers
     * 2. Move along path until I hit an obstacle (wall/rampart) and attack it UNLESS enemy creep is in range then prioritize that one without changing the travel path
     * 3. For duo squad simply make one hole and for quads make two wide hole then continue on path (check if nextDirection of Path is an enemy structure)
     * 4. Destroy tower/spawn then go for creeps then for everything else (could be prioritized later)
     *
     * Check if any enemy creeps are around that are not standing on ramparts. If so prioritize them. Otherwise simply get rid of the structure that is in the way.
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
