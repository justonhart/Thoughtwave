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
    public assignment: string;
    public isFleeing: boolean;
    private orientation: TOP | RIGHT | BOTTOM | LEFT;
    private anchor: RIGHT | LEFT; // relative position (clockwise)
    private nextDirection: DirectionConstant;
    private lastRun: number;
    private targetStructure: Id<Structure>;

    public constructor(creep: CombatCreep) {
        this.squadId = creep.memory.combat.squadId;
        this.currentCreep = creep;
        this.forcedDestinations = Memory.empire.squads[this.squadId].forcedDestinations;
        this.assignment = Memory.empire.squads[this.squadId].assignment;
        this.orientation = Memory.empire.squads[this.squadId].orientation;
        this.anchor = Memory.empire.squads[this.squadId].anchor;
        this.lastRun = Memory.empire.squads[this.squadId].lastRun;
        this.isFleeing = Memory.empire.squads[this.squadId].isFleeing;
        this.nextDirection = Memory.empire.squads[this.squadId].nextDirection;
        if (!this.targetStructure) {
            this.targetStructure = Memory.empire.squads[this.squadId].targetStructure;
        }
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

    public missingCreeps() {
        if (this.isPartOfDuo()) {
            return !this.squadLeader || !this.squadFollower;
        }
        return !this.squadLeader || !this.squadFollower || !this.squadSecondFollower || !this.squadSecondLeader;
    }

    private onFirstCreep(): boolean {
        if (!this.lastRun) {
            return true;
        }
        return Math.abs(this.lastRun - Game.time) > 0;
    }

    public getInFormation(): boolean {
        if (this.isInFormation()) {
            return true;
        }
        if (this.onFirstCreep()) {
            this.setTaskPriority();
            const squadSecondLeaderTargetPos = this.findPositionNextToLeader();
            if (!squadSecondLeaderTargetPos) {
                this.linePathing();
                return false;
            }
            const followerPos = Pathing.positionAtDirection(this.squadLeader.pos, Pathing.inverseDirection(this.orientation));
            if (followerPos.lookFor(LOOK_TERRAIN).some((terrain) => terrain === 'wall')) {
                this.linePathing();
                return false;
            }

            const secondFollowerPos = Pathing.positionAtDirection(squadSecondLeaderTargetPos, Pathing.inverseDirection(this.orientation));
            if (secondFollowerPos.lookFor(LOOK_TERRAIN).some((terrain) => terrain === 'wall')) {
                this.linePathing();
                return false;
            }

            this.squadSecondLeader.travelTo(squadSecondLeaderTargetPos, { maxRooms: 1 });
            this.squadFollower.travelTo(followerPos, { maxRooms: 1, ignoreCreeps: false });
            this.squadSecondFollower.travelTo(secondFollowerPos, { maxRooms: 1, ignoreCreeps: false });
        }

        return false;
    }

    private setTaskPriority() {
        this.squadLeader.memory.currentTaskPriority = Priority.HIGH;
        this.squadSecondLeader.memory.currentTaskPriority = Priority.MEDIUM;
        this.squadFollower.memory.currentTaskPriority = Priority.LOW;
        this.squadSecondFollower.memory.currentTaskPriority = Priority.LOW;
    }

    public getInLineFormation(): boolean {
        if (this.isInLineFormation()) {
            return true;
        }

        if (this.onFirstCreep()) {
            this.squadFollower.travelTo(this.squadLeader, { range: 1 });
            this.squadSecondLeader.travelTo(this.squadFollower, { range: 1 });
            this.squadSecondFollower.travelTo(this.squadSecondLeader, { range: 1 });
        }

        return this.isSquadOnExit(); // While on exit count as true so it wont get blocked by own creeps
    }

    public formationPathing(range: number): void {
        if (this.onFirstCreep()) {
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

            let target = this.findPathingTarget();

            if (target instanceof Structure) {
                range = 1; // Go close to the structure to enable rangedMassAttac
            }

            if (target && this.squadLeader.pos.getRangeTo(target) <= range) {
                if (this.squadSecondLeader.pos.getRangeTo(target) <= range) {
                    return; // TODO: Enable fleeing (all creeps can just move in the same direction no need to rotate)
                }
                const slideDirection = this.squadSecondLeader.pos.getDirectionTo(this.squadLeader);
                let lookObject = [];
                lookObject.push(this.squadLeader.room.lookAt(Pathing.positionAtDirection(this.squadLeader.pos, slideDirection)));
                lookObject.push(this.squadFollower.room.lookAt(Pathing.positionAtDirection(this.squadFollower.pos, slideDirection)));
                if (
                    !lookObject.some(
                        (look) =>
                            look.terrain === TERRAIN_MASK_WALL ||
                            (look.type === Structure && look.structureType !== STRUCTURE_ROAD && look.structureType !== STRUCTURE_CONTAINER)
                    )
                ) {
                    this.slideSquad(slideDirection);
                }
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
        if (this.onFirstCreep()) {
            if (this.isSquadFatigued()) {
                return;
            }

            const path = this.squadLeader.memory._m.path;
            if (path) {
                if (path.length > 1) {
                    // Diretion is always consumed one tick later so nextDirection is the second element
                    this.nextDirection = parseInt(path[1], 10) as DirectionConstant;
                } else {
                    // on its last move
                    this.nextDirection = parseInt(path[0], 10) as DirectionConstant;
                }
            }

            if (this.forcedDestinations?.length) {
                let nextDestination = this.forcedDestinations[0];
                if (this.squadLeader.pos.toMemSafe() === nextDestination) {
                    Memory.empire.squads[this.squadId].forcedDestinations = this.forcedDestinations.slice(1);
                    nextDestination = this.forcedDestinations[0];
                }
                this.squadLeader.travelTo(posFromMem(nextDestination));
            } else if (Game.flags.squadMove?.pos?.roomName === this.assignment) {
                // Manual Pathing
                this.squadLeader.travelTo(Game.flags.squadMove.pos);
            } else if (this.squadLeader.pos.roomName !== this.assignment || this.squadFollower.pos.roomName !== this.assignment) {
                this.squadLeader.travelToRoom(this.assignment);
            } else if (this.getObstacleStructure()) {
                return;
            } else {
                const target = this.findPathingTarget();
                if (target instanceof Creep) {
                    this.squadLeader.travelTo(target, { range: range });
                } else {
                    this.squadLeader.travelTo(target, { range: 1, ignoreStructures: true, customMatrixCosts: this.getDuoMatrix(this.squadLeader) });
                }
            }
            this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadLeader));
        }
    }

    private findPathingTarget(): Structure {
        let target;
        if (this.targetStructure && Game.getObjectById(this.targetStructure)) {
            target = Game.getObjectById(this.targetStructure);
        } else if (this.squadLeader.pos.roomName === this.assignment) {
            target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                filter: (struct) => struct.structureType === STRUCTURE_TOWER,
            }) as Structure;
            if (!target) {
                target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                }) as Structure;
            }
            if (!target) {
                target = this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType !== STRUCTURE_KEEPER_LAIR,
                }) as Structure;
            }
        }

        if (target) {
            this.targetStructure = target?.id;
        } else {
            target = this.findHostileCreep();
        }

        return target;
    }

    private findHostileCreep() {
        return this.squadLeader.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    }

    /**
     * Get any structure that is blocking us since pathing takes a direct route by default
     * TODO: make it so that creeps dont go diagonally after getting through wall/rampart
     * @returns
     */
    public getObstacleStructure(): Structure {
        if (!this.currentCreep.onEdge() && this.nextDirection && !this.missingCreeps()) {
            let enemyStructure = Pathing.positionAtDirection(this.squadLeader.pos, this.nextDirection)
                .lookFor(LOOK_STRUCTURES)
                .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
            if (enemyStructure.length) {
                return enemyStructure[0];
            }
            if (this.isPartOfQuad()) {
                if (!this.squadFollower.onEdge()) {
                    enemyStructure = Pathing.positionAtDirection(this.squadFollower.pos, this.nextDirection)
                        .lookFor(LOOK_STRUCTURES)
                        .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                    if (enemyStructure.length) {
                        return enemyStructure[0];
                    }
                }
                if (!this.squadSecondLeader.onEdge()) {
                    enemyStructure = Pathing.positionAtDirection(this.squadSecondLeader.pos, this.nextDirection)
                        .lookFor(LOOK_STRUCTURES)
                        .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                    if (enemyStructure.length) {
                        return enemyStructure[0];
                    }
                }
                enemyStructure = Pathing.positionAtDirection(this.squadSecondFollower.pos, this.nextDirection)
                    .lookFor(LOOK_STRUCTURES)
                    .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }
        }
    }

    private findPath(target: any, range: number): PathFinderPath {
        const matrix = SquadManagement.getQuadMatrix(this.squadLeader, this.assignment, this.orientation, this.anchor);

        if (Game.flags.squadMove?.pos?.roomName === this.assignment) {
            // Manual targeting (costMatrix disabled?)
            return Pathing.findTravelPath(this.squadLeader.name, this.squadLeader.pos, Game.flags.squadMove.pos, 1, { customMatrixCosts: matrix });
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

    private slideSquad(direction: DirectionConstant): void {
        this.squadLeader.move(direction);
        this.squadSecondLeader.move(direction);
        this.squadFollower.move(direction);
        this.squadSecondFollower.move(direction);
    }

    private moveSquad(): void {
        this.nextDirection = parseInt(this.squadLeader.memory._m.path[0], 10) as DirectionConstant;
        const directionDiff = Math.abs(this.orientation - this.nextDirection);
        // swap in x shape to keep anchor in same location (180°)
        if (directionDiff === 5) {
            this.squadLeader.move(this.squadLeader.pos.getDirectionTo(this.squadSecondFollower));
            this.squadSecondLeader.move(this.squadSecondLeader.pos.getDirectionTo(this.squadFollower));
            this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadSecondLeader));
            this.squadSecondFollower.move(this.squadSecondFollower.pos.getDirectionTo(this.squadLeader));
            this.orientation = Pathing.inverseDirection(this.orientation) as TOP | LEFT | RIGHT | BOTTOM;
            delete this.squadLeader.memory._m.path;
            return;
        }

        // rotate in new direction and recalculate path from new direction
        if (directionDiff >= 2) {
            if (directionDiff > 4 && 8 - directionDiff >= 2) {
                if (this.orientation - this.nextDirection > 0) {
                    this.rotate('clockwise');
                } else {
                    this.rotate('counterclockwise');
                }
                delete this.squadLeader.memory._m.path;
                return;
            } else if (directionDiff < 4) {
                if (this.orientation - this.nextDirection > 0) {
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
        let newRoomPos = Pathing.positionAtDirection(this.squadLeader.pos, this.nextDirection);
        if (newRoomPos) {
            lookObject.push(this.squadLeader.room.lookAt(newRoomPos.x, newRoomPos.y));
        }
        newRoomPos = Pathing.positionAtDirection(this.squadSecondLeader.pos, this.nextDirection);
        if (newRoomPos) {
            lookObject.push(this.squadSecondLeader.room.lookAt(newRoomPos.x, newRoomPos.y));
        }

        if (!lookObject.some((look) => look.terrain === TERRAIN_MASK_WALL)) {
            this.squadLeader.memory._m.path = this.squadLeader.memory._m.path.slice(1);
            this.squadLeader.move(this.nextDirection);
            this.squadFollower.move(this.nextDirection);
            this.squadSecondLeader.move(this.nextDirection);
            this.squadSecondFollower.move(this.nextDirection);
        }
    }

    public getDuoMatrix(creep: Creep): CustomMatrixCost[] {
        const roomName = creep.room.name;
        if (!global.duoMatrix) {
            global.duoMatrix = {};
        }
        if (global.duoMatrix[roomName]) {
            return global.duoMatrix[roomName];
        }

        const customCostMatrix: CustomMatrixCost[] = [];

        Game.rooms[roomName]
            .find(FIND_STRUCTURES)
            .filter((structure) => structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL)
            .forEach((blockade) => {
                let cost = 25;
                if (blockade.hits < 15000000) {
                    cost += Math.floor(blockade.hits / 200000);
                } else {
                    cost += 75 + Math.floor(blockade.hits / 3000000);
                }
                customCostMatrix.push({ x: blockade.pos.x, y: blockade.pos.y, cost: cost });
            });

        global.duoMatrix[roomName] = customCostMatrix;
        return global.duoMatrix[roomName];
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
        let directionToExit: TOP | RIGHT | BOTTOM | LEFT;
        const roomName = creep.room.name;
        const terrain = new Room.Terrain(roomName);
        let minY = 0;
        let maxY = 50;
        let minX = 0;
        let maxX = 50;
        // Ensure there are spaces around exit to make a formation
        if (inPreviousRoom) {
            if (exits['1'] === assignment) {
                maxY = 3;
                directionToExit = 1;
            } else if (exits['3'] === assignment) {
                minX = 46;
                directionToExit = 3;
            } else if (exits['5'] === assignment) {
                minY = 46;
                directionToExit = 5;
            } else if (exits['7'] === assignment) {
                maxX = 3;
                directionToExit = 7;
            }
        } else {
            // Structure Cost
            Game.rooms[roomName]
                .find(FIND_STRUCTURES)
                .filter((structure) => structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL)
                .forEach((blockade) => {
                    let cost = 25;
                    if (blockade.hits < 15000000) {
                        cost += Math.floor(blockade.hits / 200000);
                    } else {
                        cost += 75 + Math.floor(blockade.hits / 3000000);
                    }
                    customCostMatrix.push({ x: blockade.pos.x, y: blockade.pos.y, cost: cost });
                });
        }
        // Orientation based matrix stuff
        const enableVisuals = false;
        for (let y = minY; y < maxY; y++) {
            for (let x = minX; x < maxX; x++) {
                const tile = terrain.get(x, y);
                if (tile === TERRAIN_MASK_WALL) {
                    if (inPreviousRoom) {
                        if (directionToExit === 1) {
                            customCostMatrix.push({ x: x, y: 0, cost: 255 });
                            customCostMatrix.push({ x: x, y: 1, cost: 255 });
                            customCostMatrix.push({ x: x, y: 2, cost: 255 });
                            SquadManagement.showVisuals(enableVisuals, new RoomPosition(x, 0, roomName));
                        } else if (directionToExit === 3) {
                            customCostMatrix.push({ x: 49, y: y, cost: 255 });
                            customCostMatrix.push({ x: 48, y: y, cost: 255 });
                            customCostMatrix.push({ x: 47, y: y, cost: 255 });
                            SquadManagement.showVisuals(enableVisuals, new RoomPosition(49, y, roomName));
                        } else if (directionToExit === 5) {
                            customCostMatrix.push({ x: x, y: 49, cost: 255 });
                            customCostMatrix.push({ x: x, y: 48, cost: 255 });
                            customCostMatrix.push({ x: x, y: 47, cost: 255 });
                            SquadManagement.showVisuals(enableVisuals, new RoomPosition(x, 49, roomName));
                        } else {
                            customCostMatrix.push({ x: 0, y: y, cost: 255 });
                            customCostMatrix.push({ x: 1, y: y, cost: 255 });
                            customCostMatrix.push({ x: 2, y: y, cost: 255 });
                            SquadManagement.showVisuals(enableVisuals, new RoomPosition(0, y, roomName));
                        }
                    } else {
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

    public pathing() {
        if (this.missingCreeps()) {
            this.fleeing();
            this.isFleeing = true;
        } else {
            this.isFleeing = false;
        }

        const range = this.currentCreep.getActiveBodyparts(RANGED_ATTACK) ? 2 : 1;
        if (this.isPartOfQuad()) {
            if (!this.isFleeing && !this.closeToTargetRoom()) {
                if (this.getInLineFormation()) {
                    this.linePathing();
                }
            } else if (!this.isFleeing && this.getInFormation()) {
                this.formationPathing(range);
            }
        } else if (this.isPartOfDuo()) {
            if (!this.isFleeing && this.getInDuoFormation()) {
                this.duoPathing(range);
            }
        }
        this.cleanUp();
    }

    public linePathing(): void {
        if (this.onFirstCreep()) {
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

            this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadLeader));
            this.squadSecondLeader.move(this.squadSecondLeader.pos.getDirectionTo(this.squadFollower));
            this.squadSecondFollower.move(this.squadSecondFollower.pos.getDirectionTo(this.squadSecondLeader));
        }
    }

    private isSquadFatigued(): boolean {
        if (this.isPartOfDuo()) {
            return !!this.squadLeader?.fatigue || !!this.squadFollower?.fatigue;
        }
        return !!this.squadLeader.fatigue || !!this.squadFollower.fatigue || !!this.squadSecondFollower.fatigue || !!this.squadSecondLeader.fatigue;
    }

    private isSquadOnExit(): boolean {
        return this.squadLeader?.onEdge() || this.squadFollower?.onEdge() || this.squadSecondLeader?.onEdge() || this.squadSecondFollower?.onEdge();
    }

    private isInLineFormation(): boolean {
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
        if (this.onFirstCreep() && !this.forcedDestinations?.length) {
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
            const lastHealingTarget = Game.creeps[this.currentCreep.memory.combat.healingTarget];
            if (lastHealingTarget) {
                return lastHealingTarget;
            }
            return this.currentCreep;
        }
        this.currentCreep.memory.combat.healingTarget = targetCreep.name;
        return targetCreep;
    }

    public cleanUp() {
        if (this.onFirstCreep()) {
            Memory.empire.squads[this.squadId].lastRun = Game.time;
            Memory.empire.squads[this.squadId].isFleeing = this.isFleeing;
            if (!this.missingCreeps() && (this.isInDuoFormation() || this.isInFormation())) {
                if (this.orientation) {
                    Memory.empire.squads[this.squadId].orientation = this.orientation;
                }
                Memory.empire.squads[this.squadId].targetStructure = this.targetStructure;
                Memory.empire.squads[this.squadId].nextDirection = this.nextDirection;
            }
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
