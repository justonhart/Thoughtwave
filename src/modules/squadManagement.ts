import { CombatCreep } from '../virtualCreeps/combatCreep';
import { posFromMem } from './memoryManagement';
import { Pathing } from './pathing';

export class SquadManagement {
    private squadId: string;
    private currentCreep: CombatCreep;
    private squadLeader: CombatCreep;
    private squadFollower: CombatCreep;
    private squadSecondLeader: CombatCreep;
    private squadSecondFollower: CombatCreep;
    private forcedDestinations: string[];
    private assignment: string;
    private orientation: TOP | RIGHT | BOTTOM | LEFT;
    private anchor: RIGHT | LEFT; // relative position (clockwise)

    constructor(creep: CombatCreep) {
        this.squadId = creep.memory.combat.squadId;
        this.currentCreep = creep;
        this.forcedDestinations = Memory.empire.squads[this.squadId].forcedDestinations;
        this.assignment = Memory.empire.squads[this.squadId].assignment;
        this.orientation = Memory.empire.squads[this.squadId].orientation;
        this.anchor = Memory.empire.squads[this.squadId].anchor;
        // Memory Management
        if (!Memory.empire.squads[this.squadId].members) {
            Memory.empire.squads[this.squadId].members = {};
        }
        Memory.empire.squads[this.squadId].members[creep.memory.combat.squadMemberType] = creep.name;

        this.squadLeader = Game.creeps[Memory.empire.squads[this.squadId]?.members[SquadMemberType.SQUAD_LEADER]] as CombatCreep;
        this.squadFollower = Game.creeps[Memory.empire.squads[this.squadId]?.members[SquadMemberType.SQUAD_FOLLOWER]] as CombatCreep;
        this.squadSecondLeader = Game.creeps[Memory.empire.squads[this.squadId]?.members[SquadMemberType.SQUAD_SECOND_LEADER]] as CombatCreep;
        this.squadSecondFollower = Game.creeps[Memory.empire.squads[this.squadId]?.members[SquadMemberType.SQUAD_SECOND_FOLLOWER]] as CombatCreep;
    }

    public isPartOfDuo() {
        return Memory.empire.squads[this.squadId].squadType === SquadType.DUO;
    }

    public isPartOfQuad() {
        return Memory.empire.squads[this.squadId].squadType === SquadType.QUAD;
    }

    public missingQuadCreep(): boolean {
        return !this.squadLeader || !this.squadFollower || !this.squadSecondFollower || !this.squadSecondLeader;
    }

    public missingDuoCreep(): boolean {
        return !this.squadLeader || !this.squadFollower;
    }

    public getInFormation(): boolean {
        if (this.isInFormation()) {
            return true;
        }
        if (this.isSquadLeader()) {
            const squadSecondLeaderTargetPos = this.findPositionNextToLeader();
            if (!squadSecondLeaderTargetPos) {
                // Could not assemble so go close to destination and try each time (needed for when a formation needs to split up to get to the target)
                this.linePathing();
                return false;
            }
            this.squadSecondLeader.travelTo(squadSecondLeaderTargetPos, { maxRooms: 1 });
            const followerPos = Pathing.positionAtDirection(this.squadLeader.pos, Pathing.inverseDirection(this.orientation));
            if (followerPos.lookFor(LOOK_TERRAIN).some((terrain) => terrain === 'wall')) {
                this.linePathing();
                return false;
            }
            this.squadFollower.travelTo(followerPos, { maxRooms: 1 });

            const secondFollowerPos = Pathing.positionAtDirection(squadSecondLeaderTargetPos, Pathing.inverseDirection(this.orientation));
            if (secondFollowerPos.lookFor(LOOK_TERRAIN).some((terrain) => terrain === 'wall')) {
                this.linePathing();
                return false;
            }
            this.squadSecondFollower.travelTo(secondFollowerPos, { maxRooms: 1 });
        }

        return false;
    }

    private isSquadLeader() {
        return this.currentCreep.id === this.squadLeader.id;
    }

    public getInLineFormation(): boolean {
        if (this.isInLineFormation()) {
            return true;
        }

        if (this.isSquadLeader()) {
            this.squadFollower.travelTo(this.squadLeader, { range: 1 });
            this.squadSecondLeader.travelTo(this.squadFollower, { range: 1 });
            this.squadSecondFollower.travelTo(this.squadSecondLeader, { range: 1 });
        }
    }

    public formationPathing(range: number): void {
        if (this.isSquadLeader()) {
            if (this.isSquadFatigued()) {
                return;
            }

            if (this.squadLeader.pos.roomName !== this.assignment) {
                if (!this.squadLeader.memory._m.path || this.squadLeader.pos.roomName !== this.assignment) {
                    this.squadLeader.memory._m.path = `${this.orientation}${this.orientation}`; // move in same direction until all creeps are in the new room
                }

                this.moveSquad();
                return;
            }

            const target = this.squadLeader.pos.roomName === this.assignment ? this.findPathingTarget() : undefined; // Only search for targets once in assignment room
            if (target && this.squadLeader.pos.getRangeTo(target) <= range && this.squadSecondLeader.pos.getRangeTo(target) <= range) {
                return; // TODO: Enable fleeing (all creeps can just move in the same direction no need to rotate)
            }
            // TODO: Rotate if only one creep is in range (especially important for melee units so both face the front): get position after rotation and check range for clockwise/counterclowise?
            const squadPath = this.findPath(target, range);

            // TODO: optimize so only if target changes or not close enough it will do the above search for target (aside from creep which should be checked every tick)
            if (!squadPath && this.squadLeader.memory._m.path) {
                this.moveSquad();
            } else if (squadPath?.path?.length > 0) {
                this.squadLeader.memory._m.path = Pathing.serializePath(this.squadLeader.pos, squadPath.path);
                this.moveSquad();
            } else if (squadPath?.incomplete) {
                // TODO: try different rotations...simulate rotations and then find path (will be cpu expensive but should not happen often)
                Math.random() > 0.5 ? this.rotate('clockwise') : this.rotate('counterclockwise');
                console.log(`Squad ${this.squadId} could not find path in room ${this.squadLeader.pos.roomName}`);
            }
        }
    }

    public duoPathing(range: number) {
        if (this.isSquadFatigued()) {
            return;
        }

        if (this.forcedDestinations?.length) {
            let nextDestination = this.forcedDestinations[0];
            if (this.squadLeader.pos.toMemSafe() === nextDestination) {
                Memory.empire.squads[this.squadId].forcedDestinations = this.forcedDestinations.slice(1);
                nextDestination = this.forcedDestinations[0];
            }
            this.squadLeader.travelTo(posFromMem(nextDestination));
        } else if (Game.flags.moveSquad?.pos?.roomName === this.assignment) {
            // Manual Pathing
            this.squadLeader.travelTo(Game.flags.moveSquad.pos);
        } else if (this.squadLeader.pos.roomName !== this.assignment || this.squadFollower.pos.roomName !== this.assignment) {
            this.squadLeader.travelToRoom(this.assignment);
        } else if (this.getObstacleStructure()) {
            return;
        } else {
            const target = this.findPathingTarget();
            if (target instanceof Creep) {
                this.squadLeader.travelTo(target, { range: range });
            }
            this.squadLeader.travelTo(target, { range: 1, ignoreStructures: true });
        }
        this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadLeader));
    }

    private findPathingTarget(): any {
        // TODO: optimize ==> save structures in memory and only check for creeps
        let target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
            filter: (struct) => struct.structureType === STRUCTURE_TOWER,
        }) as any;
        if (!target) {
            target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
            });
        }
        if (!target) {
            target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        }
        if (!target) {
            target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
        }

        return target;
    }

    /**
     * Get any structure that is blocking us since pathing takes a direct route by default
     * @returns
     */
    public getObstacleStructure(): Structure {
        if (this.isPartOfDuo) {
            if (this.squadLeader.memory._m.path) {
                let enemyStructure = Pathing.positionAtDirection(
                    this.squadLeader.pos,
                    parseInt(this.squadLeader.memory._m.path[0], 10) as DirectionConstant
                )
                    .lookFor(LOOK_STRUCTURES)
                    .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }
            return;
        }
        let enemyStructure = Pathing.positionAtDirection(this.squadLeader.pos, this.orientation)
            .lookFor(LOOK_STRUCTURES)
            .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
        if (enemyStructure.length) {
            return enemyStructure[0];
        }
        enemyStructure = Pathing.positionAtDirection(this.squadSecondLeader.pos, this.orientation)
            .lookFor(LOOK_STRUCTURES)
            .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
        if (enemyStructure.length) {
            return enemyStructure[0];
        }
    }

    public findPriorityAttackTarget(range: number) {
        const areaInRange = Pathing.getArea(this.currentCreep.pos, range);
        const unprotectedHostileCreep = this.currentCreep.room
            .lookAtArea(areaInRange.top, areaInRange.left, areaInRange.bottom, areaInRange.right, true)
            .filter(
                (lookObject) =>
                    lookObject.type === LOOK_CREEPS &&
                    lookObject.creep?.owner?.username !== this.currentCreep.owner.username &&
                    lookObject.structure?.structureType !== STRUCTURE_RAMPART
            );

        if (unprotectedHostileCreep.length) {
            return unprotectedHostileCreep[0].creep;
        }

        if (this.currentCreep.pos.roomName === this.assignment) {
            if (Game.flags.target?.pos?.roomName === this.assignment) {
                // Manual targeting
                const enemyStructure = Game.flags.target.pos.lookFor(LOOK_STRUCTURES);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }

            const obstacleStructure = this.getObstacleStructure();
            if (obstacleStructure) {
                return obstacleStructure;
            }
            let target: any;
            if (!target) {
                target = this.currentCreep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_TOWER,
                });
            }
            if (!target) {
                target = this.currentCreep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                });
            }
            if (!target) {
                target = this.currentCreep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            }
            if (!target) {
                target = this.currentCreep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
            }
            return target;
        }
    }

    private findPath(target: any, range: number): PathFinderPath {
        const matrix = SquadManagement.getQuadMatrix(this.squadLeader, this.assignment, this.orientation, this.anchor);
        if (Game.flags.moveSquad?.pos?.roomName === this.assignment) {
            // Manual targeting (costMatrix disabled?)
            return Pathing.findTravelPath(this.squadLeader.name, this.squadLeader.pos, Game.flags.moveSquad.pos, 1, { customMatrixCosts: matrix });
        }
        if (posFromMem(this.squadLeader.memory._m.lastCoord).roomName !== this.squadLeader.pos.roomName) {
            delete this.squadLeader.memory._m.path;
        }
        if (target && !this.squadLeader.memory._m.path) {
            let options: TravelToOpts = { exitCost: 50, maxRooms: 1 };
            if (!this.isSquadOnExit()) {
                options.customMatrixCosts = matrix;
            }
            if (!target) {
                options.range = 22;
                return Pathing.findTravelPath(
                    this.squadLeader.name,
                    this.squadLeader.pos,
                    new RoomPosition(25, 25, this.squadLeader.pos.roomName),
                    1,
                    options
                );
            } else if (target instanceof Creep) {
                options.range = range;
                options.ignoreStructures = true;
                return Pathing.findTravelPath(this.squadLeader.name, this.squadLeader.pos, target.pos, 1, options);
            } else {
                options.ignoreStructures = true;
                options.range = 1;
                return Pathing.findTravelPath(this.squadLeader.name, this.squadLeader.pos, target.pos, 1, options);
            }
        } else if (this.squadLeader.pos.roomName !== this.assignment) {
            return Pathing.findTravelPath(this.squadLeader.name, this.squadLeader.pos, new RoomPosition(25, 25, this.squadLeader.pos.roomName), 1, {
                customMatrixCosts: matrix,
            });
        }
        return;
    }

    public inTargetRoom(): boolean {
        const targetRoom = this.assignment;
        return (
            this.squadLeader.pos.roomName === targetRoom ||
            this.squadSecondFollower.pos.roomName === targetRoom ||
            this.squadFollower.pos.roomName === targetRoom ||
            this.squadSecondLeader.pos.roomName === targetRoom
        );
    }

    private moveSquad(): void {
        const direction = parseInt(this.squadLeader.memory._m.path[0], 10) as DirectionConstant;
        const directionDiff = Math.abs(this.orientation - direction);
        // swap (180°)
        if (directionDiff === 4) {
            this.squadLeader.memory._m.path = this.squadLeader.memory._m.path.slice(1);
            this.squadLeader.move(direction);
            this.squadSecondLeader.move(direction);
            this.squadFollower.move(Pathing.inverseDirection(direction));
            this.squadSecondFollower.move(Pathing.inverseDirection(direction));
            this.orientation = Pathing.inverseDirection(this.orientation) as TOP | LEFT | RIGHT | BOTTOM;
            return;
        }

        // rotate in new direction and recalculate path from new direction
        if (directionDiff >= 2) {
            if (directionDiff > 4 && 8 - directionDiff >= 2) {
                if (this.orientation - direction > 0) {
                    this.rotate('clockwise');
                } else {
                    this.rotate('counterclockwise');
                }
                delete this.squadLeader.memory._m.path;
                return;
            } else if (directionDiff < 4) {
                if (this.orientation - direction > 0) {
                    this.rotate('counterclockwise');
                } else {
                    this.rotate('clockwise');
                }
                delete this.squadLeader.memory._m.path;
                return;
            }
        }

        if (this.getObstacleStructure()) {
            return;
        }

        let lookObject = [];
        let newRoomPos = Pathing.positionAtDirection(this.squadLeader.pos, direction);
        if (newRoomPos) {
            lookObject.push(this.squadLeader.room.lookAt(newRoomPos.x, newRoomPos.y));
        }
        newRoomPos = Pathing.positionAtDirection(this.squadSecondLeader.pos, direction);
        if (newRoomPos) {
            lookObject.push(this.squadSecondLeader.room.lookAt(newRoomPos.x, newRoomPos.y));
        }

        if (!lookObject.some((look) => look.terrain === TERRAIN_MASK_WALL)) {
            this.squadLeader.memory._m.path = this.squadLeader.memory._m.path.slice(1);
            this.squadLeader.move(direction);
            this.squadFollower.move(direction);
            this.squadSecondLeader.move(direction);
            this.squadSecondFollower.move(direction);
        }
    }

    public static getQuadMatrix(
        creep: Creep,
        assignment: string,
        orientation: TOP | RIGHT | BOTTOM | LEFT,
        anchor: LEFT | RIGHT,
        inPreviousRoom?: boolean
    ): CustomMatrixCost[] {
        const quadKey = assignment + orientation + anchor;
        if (!global.quadMatrix) {
            global.quadMatrix = {};
        }
        if (global.quadMatrix[quadKey]) {
            return global.quadMatrix[quadKey];
        }

        const customCostMatrix: CustomMatrixCost[] = [];
        const exits = Game.map.describeExits(creep.room.name);
        const roomName = creep.room.name;
        const terrain = new Room.Terrain(roomName);
        let y = 0;
        let maxY = 50;
        let x = 0;
        let maxX = 50;
        // Ensure there are spaces around exit to make a formation
        if (inPreviousRoom) {
            if (exits['1'] === assignment) {
                maxY = 3;
            } else if (exits['3'] === assignment) {
                x = 46;
            } else if (exits['5'] === assignment) {
                y = 46;
            } else if (exits['7'] === assignment) {
                maxX = 3;
            }
        }
        for (y = 0; y < maxY; y++) {
            for (x = 0; x < maxX; x++) {
                const tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    if (inPreviousRoom) {
                        let avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), RIGHT);
                        if (avoid) {
                            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                        }
                        avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), BOTTOM);
                        if (avoid) {
                            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                        }
                        avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), LEFT);
                        if (avoid) {
                            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                        }
                        avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), TOP);
                        if (avoid) {
                            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                        }
                    } else {
                        // Orientation based matrix stuff
                        const enableVisuals = true;
                        let avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), orientation);
                        if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                            SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                        }

                        if (orientation === LEFT) {
                            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), anchor === LEFT ? BOTTOM : TOP);
                            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                            }
                            if (x > 0) {
                                avoid = Pathing.positionAtDirection(new RoomPosition(x - 1, y, roomName), anchor === LEFT ? BOTTOM : TOP);
                                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                                }
                            }
                        } else if (orientation === RIGHT) {
                            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), anchor === LEFT ? TOP : BOTTOM);
                            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                            }

                            if (x < 49) {
                                avoid = Pathing.positionAtDirection(new RoomPosition(x + 1, y, roomName), anchor === LEFT ? BOTTOM : TOP);
                                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                                }
                            }
                        } else if (orientation === TOP) {
                            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), anchor);
                            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                            }
                            if (y > 0) {
                                avoid = Pathing.positionAtDirection(new RoomPosition(x, y - 1, roomName), anchor);
                                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                                }
                            }
                        } else {
                            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), Pathing.inverseDirection(anchor));
                            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                            }
                            if (y < 49) {
                                avoid = Pathing.positionAtDirection(new RoomPosition(x, y + 1, roomName), Pathing.inverseDirection(anchor));
                                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                                }
                            }
                        }
                    }
                }
            }
        }
        global.quadMatrix[quadKey] = customCostMatrix;
        return global.quadMatrix[quadKey];
    }

    private static showVisuals(enableVisuals: boolean, position: RoomPosition) {
        if (enableVisuals) {
            new RoomVisual(position.roomName).circle(new RoomPosition(position.x, position.y, position.roomName), {
                radius: 0.45,
                fill: 'transparent',
                stroke: 'red',
                strokeWidth: 0.15,
                opacity: 0.7,
            });
        }
    }

    public linePathing(): void {
        if (this.isSquadLeader()) {
            if (this.isSquadFatigued()) {
                return;
            }

            if (this.forcedDestinations?.length) {
                let nextDestination = this.forcedDestinations[0];
                if (this.squadLeader.pos.toMemSafe() === nextDestination) {
                    Memory.empire.squads[this.squadId].forcedDestinations = this.forcedDestinations.slice(1);
                    nextDestination = this.forcedDestinations[0];
                }
                this.squadLeader.travelTo(posFromMem(nextDestination));
            } else if (this.squadLeader.pos.roomName === this.assignment) {
                this.squadLeader.travelTo(posFromMem(this.squadLeader.memory._m.destination));
            } else {
                const exits = Game.map.describeExits(this.squadLeader.room.name);
                if (Object.values(exits).find((exit) => exit === this.assignment)) {
                    this.squadLeader.travelToRoom(this.assignment, {
                        customMatrixCosts: SquadManagement.getQuadMatrix(this.squadLeader, this.assignment, this.orientation, this.anchor, true),
                    });
                } else {
                    this.squadLeader.travelToRoom(this.assignment);
                }
            }

            if (this.squadFollower.pos.getRangeTo(this.squadLeader) > 1) {
                this.squadFollower.travelTo(this.squadLeader, { range: 1 });
            } else {
                this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadLeader));
            }
            if (this.squadSecondLeader.pos.getRangeTo(this.squadFollower) > 1) {
                this.squadSecondLeader.travelTo(this.squadFollower, { range: 1 });
            } else {
                this.squadSecondLeader.move(this.squadSecondLeader.pos.getDirectionTo(this.squadFollower));
            }
            if (this.squadSecondFollower.pos.getRangeTo(this.squadSecondLeader) > 1) {
                this.squadSecondFollower.travelTo(this.squadSecondLeader, { range: 1 });
            } else {
                this.squadSecondFollower.move(this.squadSecondFollower.pos.getDirectionTo(this.squadSecondLeader));
            }
        }
    }

    private isSquadFatigued(): boolean {
        if (this.isPartOfDuo()) {
            return !!this.squadLeader.fatigue || !!this.squadFollower.fatigue;
        }
        return !!this.squadLeader.fatigue || !!this.squadFollower.fatigue || !!this.squadSecondFollower.fatigue || !!this.squadSecondLeader.fatigue;
    }

    private isSquadOnExit(): boolean {
        return this.squadLeader.onEdge() || this.squadFollower.onEdge() || this.squadSecondLeader.onEdge() || this.squadSecondFollower.onEdge();
    }

    private isInLineFormation(): boolean {
        if (this.isSquadOnExit()) {
            return true;
        }

        return (
            this.squadLeader.pos.isNearTo(this.squadFollower) &&
            this.squadFollower.pos.isNearTo(this.squadSecondLeader) &&
            this.squadSecondLeader.pos.isNearTo(this.squadSecondFollower)
        );
    }

    private isInFormation(): boolean {
        if (this.isSquadOnExit()) {
            // TODO: check for equivalent xy in other room
            // while going through exits
            return true;
        }

        const result =
            this.squadLeader.pos.isNearTo(this.squadFollower) &&
            this.squadLeader.pos.isNearTo(this.squadSecondLeader) &&
            this.squadLeader.pos.isNearTo(this.squadSecondFollower) &&
            this.squadSecondLeader.pos.isNearTo(this.squadSecondFollower) &&
            this.squadSecondLeader.pos.isNearTo(this.squadFollower) &&
            this.squadFollower.pos.isNearTo(this.squadSecondFollower);

        if (result) {
            // in formation
            if (this.squadLeader.pos.x === this.squadSecondLeader.pos.x) {
                if (this.squadLeader.pos.x === this.squadFollower.pos.x - 1) {
                    this.orientation = LEFT;
                } else {
                    this.orientation = RIGHT;
                }
            } else if (this.squadLeader.pos.y === this.squadSecondLeader.pos.y) {
                if (this.squadLeader.pos.y === this.squadFollower.pos.y - 1) {
                    this.orientation = TOP;
                } else {
                    this.orientation = BOTTOM;
                }
            }
        }
        return result;
    }

    public getInDuoFormation(): boolean {
        if (this.isInDuoFormation()) {
            return true;
        }
        this.squadFollower.travelTo(this.squadLeader, { range: 1, reusePath: 0 });
    }

    private isInDuoFormation(): boolean {
        return this.squadLeader.pos.isNearTo(this.squadFollower) || this.squadLeader.onEdge() || this.squadFollower.onEdge();
    }

    public closeToTargetRoom(): boolean {
        if (this.forcedDestinations?.length) {
            return false;
        }
        if (this.inTargetRoom()) {
            return true;
        }
        if (this.isSquadLeader() && !this.forcedDestinations?.length) {
            const { x, y } = this.squadLeader.pos;
            const exits = Game.map.describeExits(this.squadLeader.room.name);
            if (x <= 1 && exits['7'] === this.assignment) {
                this.orientation = LEFT;
                return true;
            }
            if (y <= 1 && exits['1'] === this.assignment) {
                this.orientation = TOP;
                return true;
            }
            if (x >= 48 && exits['3'] === this.assignment) {
                this.orientation = RIGHT;
                return true;
            }
            if (y >= 48 && exits['5'] === this.assignment) {
                this.orientation = BOTTOM;
                return true;
            }
        }
        return false;
    }

    public getSquadHealingTarget(): Creep {
        const squadMembers = [this.squadLeader, this.squadFollower, this.squadSecondLeader, this.squadSecondFollower].filter((member) => !!member);
        if (!squadMembers.length) {
            return this.currentCreep;
        }
        if (squadMembers.length === 1) {
            return squadMembers[0];
        }
        // Find lowest hp ratio creep that is in range
        const targetCreep = squadMembers.reduce((lowestHPSquadMember, nextSquadMember) => {
            if (
                !nextSquadMember ||
                lowestHPSquadMember.hits / lowestHPSquadMember.hitsMax < nextSquadMember.hits / nextSquadMember.hitsMax ||
                this.currentCreep.pos.getRangeTo(nextSquadMember) > 3
            ) {
                return lowestHPSquadMember;
            }
            return nextSquadMember;
        });

        if (targetCreep.hits === targetCreep.hitsMax) {
            return this.currentCreep; // everyone is full health
        }
        return targetCreep;
    }

    public cleanUp() {
        if (this.orientation) {
            Memory.empire.squads[this.squadId].orientation = this.orientation;
        }
    }

    private findPositionNextToLeader(): RoomPosition {
        const terrain = this.squadLeader.room.getTerrain();
        const { x, y, roomName } = this.squadLeader.pos;
        if (!this.orientation) {
            // Default - only used when forcedDestination is in the targetRoom
            this.orientation = TOP;
        }
        if (this.orientation === TOP || this.orientation === BOTTOM) {
            if (
                terrain.get(x - 1, y) !== TERRAIN_MASK_WALL &&
                terrain.get(x - 1, y + 1) !== TERRAIN_MASK_WALL &&
                terrain.get(x - 1, y - 1) !== TERRAIN_MASK_WALL
            ) {
                if (this.orientation === TOP) {
                    this.anchor = RIGHT;
                } else {
                    this.anchor = LEFT;
                }
                Memory.empire.squads[this.squadId].anchor = this.anchor;
                return new RoomPosition(x - 1, y, roomName);
            } else if (
                terrain.get(x + 1, y) !== TERRAIN_MASK_WALL &&
                terrain.get(x + 1, y + 1) !== TERRAIN_MASK_WALL &&
                terrain.get(x + 1, y - 1) !== TERRAIN_MASK_WALL
            ) {
                if (this.orientation === TOP) {
                    this.anchor = LEFT;
                } else {
                    this.anchor = RIGHT;
                }
                Memory.empire.squads[this.squadId].anchor = this.anchor;
                return new RoomPosition(x + 1, y, roomName);
            }
        } else if (this.orientation === RIGHT || this.orientation === LEFT) {
            if (
                terrain.get(x, y + 1) !== TERRAIN_MASK_WALL &&
                terrain.get(x + 1, y + 1) !== TERRAIN_MASK_WALL &&
                terrain.get(x - 1, y + 1) !== TERRAIN_MASK_WALL
            ) {
                if (this.orientation === LEFT) {
                    this.anchor = RIGHT;
                } else {
                    this.anchor = LEFT;
                }
                Memory.empire.squads[this.squadId].anchor = this.anchor;
                return new RoomPosition(x, y + 1, roomName);
            } else if (
                terrain.get(x, y - 1) !== TERRAIN_MASK_WALL &&
                terrain.get(x + 1, y - 1) !== TERRAIN_MASK_WALL &&
                terrain.get(x - 1, y - 1) !== TERRAIN_MASK_WALL
            ) {
                if (this.orientation === RIGHT) {
                    this.anchor = RIGHT;
                } else {
                    this.anchor = LEFT;
                }
                Memory.empire.squads[this.squadId].anchor = this.anchor;
                return new RoomPosition(x, y - 1, roomName);
            }
        }
        console.log(`Squad ${this.squadId} cannot find assemble positions in room ${roomName}.`);
    }

    private rotate(direction: 'clockwise' | 'counterclockwise') {
        if ((direction === 'clockwise' && this.anchor === LEFT) || (direction === 'counterclockwise' && this.anchor === RIGHT)) {
            this.squadLeader.move(this.squadLeader.pos.getDirectionTo(this.squadSecondLeader));
            this.squadSecondLeader.move(this.squadSecondLeader.pos.getDirectionTo(this.squadSecondFollower));
            this.squadSecondFollower.move(this.squadSecondFollower.pos.getDirectionTo(this.squadFollower));
            this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadLeader));
        } else {
            this.squadLeader.move(this.squadLeader.pos.getDirectionTo(this.squadFollower));
            this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadSecondFollower));
            this.squadSecondFollower.move(this.squadSecondFollower.pos.getDirectionTo(this.squadSecondLeader));
            this.squadSecondLeader.move(this.squadSecondLeader.pos.getDirectionTo(this.squadLeader));
        }
    }

    public fleeing(): void {
        if (this.currentCreep.pos.roomName === this.assignment) {
            // Creep died
            this.currentCreep.flee();
        } else if (this.currentCreep.pos.roomName === this.currentCreep.homeroom.name) {
            // Wait close to exit for whole squad
            const { x, y } = this.currentCreep.pos;
            if (x > 4 && x < 46 && y > 4 && y < 46) {
                this.currentCreep.travelToRoom(this.assignment);
            }
        } else {
            this.currentCreep.moveOffExit();
        }
    }
}
