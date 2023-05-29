import { CombatCreep } from '../virtualCreeps/combatCreep';
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
    public targetStructure: Id<Structure>;

    public constructor(creep: CombatCreep) {
        this.squadId = creep.memory.combat.squadId;
        this.currentCreep = creep;
        // Squad memory already removed
        if (!Memory.squads[this.squadId]) {
            creep.memory.recycle = true;
            return undefined;
        }
        this.forcedDestinations = Memory.squads[this.squadId].forcedDestinations;
        this.assignment = Memory.squads[this.squadId].assignment;
        this.orientation = Memory.squads[this.squadId].orientation;
        this.anchor = Memory.squads[this.squadId].anchor;
        this.lastRun = Memory.squads[this.squadId].lastRun;
        this.isFleeing = Memory.squads[this.squadId].isFleeing;
        this.nextDirection = Memory.squads[this.squadId].nextDirection;
        if (!this.targetStructure) {
            this.targetStructure = Memory.squads[this.squadId].targetStructure;
        }
        // Memory Management
        if (!Memory.squads[this.squadId].members) {
            Memory.squads[this.squadId].members = {};
        }
        Memory.squads[this.squadId].members[creep.memory.combat.squadMemberType] = creep.name;

        this.squadLeader = Game.creeps[Memory.squads[this.squadId]?.members[SquadMemberType.SQUAD_LEADER]] as CombatCreep;
        this.squadFollower = Game.creeps[Memory.squads[this.squadId]?.members[SquadMemberType.SQUAD_FOLLOWER]] as CombatCreep;
        this.squadSecondLeader = Game.creeps[Memory.squads[this.squadId]?.members[SquadMemberType.SQUAD_SECOND_LEADER]] as CombatCreep;
        this.squadSecondFollower = Game.creeps[Memory.squads[this.squadId]?.members[SquadMemberType.SQUAD_SECOND_FOLLOWER]] as CombatCreep;
    }

    public isPartOfDuo() {
        return Memory.squads[this.squadId].squadType === SquadType.DUO;
    }

    public isPartOfQuad() {
        return Memory.squads[this.squadId].squadType === SquadType.QUAD;
    }

    private missingCreeps() {
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

    private getInFormation(): boolean {
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
            if (followerPos?.lookFor(LOOK_TERRAIN).some((terrain) => terrain === 'wall')) {
                this.linePathing();
                return false;
            }

            const secondFollowerPos = Pathing.positionAtDirection(squadSecondLeaderTargetPos, Pathing.inverseDirection(this.orientation));
            if (secondFollowerPos?.lookFor(LOOK_TERRAIN).some((terrain) => terrain === 'wall')) {
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

    private getInLineFormation(): boolean {
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

    private formationPathing(range: number): void {
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
                range = 1; // Go close to the structure to enable rangedMassAttack
            }

            if (Game.flags.squadMove?.pos?.roomName !== this.assignment && this.faceTargetWhenInRange(target, range)) {
                return;
            }
            const squadPath = this.findPath(target, range);

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

    public faceTargetWhenInRange(target: Structure, range: number): boolean {
        const obstacle = this.getObstacleStructure();
        if ((target && this.squadLeader.pos.getRangeTo(target) <= range) || (obstacle && this.squadLeader.pos.getRangeTo(obstacle) <= range)) {
            if (this.squadSecondLeader.pos.getRangeTo(target) <= range || (obstacle && this.squadSecondLeader.pos.getRangeTo(obstacle) <= range)) {
                return false; // TODO: Enable fleeing (all creeps can just move in the same direction no need to rotate)
            }
            const slideDirection = this.squadSecondLeader.pos.getDirectionTo(this.squadLeader);
            const directionDiff = Math.abs(this.squadSecondLeader.pos.getDirectionTo(target) - slideDirection);
            let lookObject = this.squadLeader.room
                .lookAt(Pathing.positionAtDirection(this.squadLeader.pos, slideDirection))
                .concat(this.squadFollower.room.lookAt(Pathing.positionAtDirection(this.squadFollower.pos, slideDirection)));
            if (
                !lookObject.some(
                    (look) =>
                        look.terrain === 'wall' ||
                        (look.type === LOOK_STRUCTURES &&
                            look.structure.structureType !== STRUCTURE_ROAD &&
                            look.structure.structureType !== STRUCTURE_CONTAINER)
                )
            ) {
                this.slideSquad(slideDirection);
                this.getNextDirectionAfterSliding(slideDirection);
                return true;
            } else if ((directionDiff > 4 && 8 - directionDiff < 2) || directionDiff < 2) {
                if (this.anchor === LEFT) {
                    this.rotate('counterclockwise');
                } else {
                    this.rotate('clockwise');
                }
                return true;
            }
        } else if (
            (target && this.squadSecondLeader.pos.getRangeTo(target) <= range) ||
            (obstacle && this.squadSecondLeader.pos.getRangeTo(obstacle) <= range)
        ) {
            const slideDirection = this.squadLeader.pos.getDirectionTo(this.squadSecondLeader);
            const directionDiff = Math.abs(this.squadLeader.pos.getDirectionTo(target) - slideDirection);
            let lookObject = this.squadSecondLeader.room
                .lookAt(Pathing.positionAtDirection(this.squadSecondLeader.pos, slideDirection))
                .concat(this.squadSecondFollower.room.lookAt(Pathing.positionAtDirection(this.squadSecondFollower.pos, slideDirection)));
            if (
                !lookObject.some(
                    (look) =>
                        look.terrain === 'wall' ||
                        (look.type === LOOK_STRUCTURES &&
                            look.structure.structureType !== STRUCTURE_ROAD &&
                            look.structure.structureType !== STRUCTURE_CONTAINER)
                )
            ) {
                this.slideSquad(slideDirection);
                this.getNextDirectionAfterSliding(slideDirection);
                return true;
            } else if ((directionDiff > 4 && 8 - directionDiff < 2) || directionDiff < 2) {
                if (this.anchor === RIGHT) {
                    this.rotate('counterclockwise');
                } else {
                    this.rotate('clockwise');
                }
                return true;
            }
        }
    }

    private getNextDirectionAfterSliding(slideDirection: DirectionConstant) {
        if (this.orientation === BOTTOM) {
            if (slideDirection === RIGHT) {
                this.nextDirection++;
                if (this.nextDirection === 9) {
                    this.nextDirection = 8;
                }
            } else {
                this.nextDirection--;
                if (this.nextDirection === 0) {
                    this.nextDirection = 8;
                }
            }
        } else if (this.orientation === TOP) {
            if (slideDirection === LEFT) {
                this.nextDirection++;
                if (this.nextDirection === 9) {
                    this.nextDirection = 8;
                }
            } else {
                this.nextDirection--;
                if (this.nextDirection === 0) {
                    this.nextDirection = 8;
                }
            }
        } else if (this.orientation === RIGHT) {
            if (slideDirection === TOP) {
                this.nextDirection++;
                if (this.nextDirection === 9) {
                    this.nextDirection = 8;
                }
            } else {
                this.nextDirection--;
                if (this.nextDirection === 0) {
                    this.nextDirection = 8;
                }
            }
        } else if (this.orientation === LEFT) {
            if (slideDirection === BOTTOM) {
                this.nextDirection++;
                if (this.nextDirection === 9) {
                    this.nextDirection = 8;
                }
            } else {
                this.nextDirection--;
                if (this.nextDirection === 0) {
                    this.nextDirection = 8;
                }
            }
        }
    }

    public static splitQuadIntoDuos(squadId: string) {
        const currentSquadMem = Memory.squads[squadId];
        const newSquadId = squadId + '2';

        let newSquadMem = currentSquadMem;
        newSquadMem.members[SquadMemberType.SQUAD_LEADER] = currentSquadMem.members[SquadMemberType.SQUAD_SECOND_LEADER];
        newSquadMem.members[SquadMemberType.SQUAD_FOLLOWER] = currentSquadMem.members[SquadMemberType.SQUAD_SECOND_FOLLOWER];
        delete newSquadMem.members[SquadMemberType.SQUAD_SECOND_LEADER];
        delete newSquadMem.members[SquadMemberType.SQUAD_SECOND_FOLLOWER];
        delete newSquadMem.nextDirection;
        newSquadMem.squadType = SquadType.DUO;
        delete currentSquadMem.members[SquadMemberType.SQUAD_SECOND_LEADER];
        delete currentSquadMem.members[SquadMemberType.SQUAD_SECOND_FOLLOWER];
        delete currentSquadMem.nextDirection;
        currentSquadMem.squadType = SquadType.DUO;

        Memory.squads[squadId] = currentSquadMem;
        Memory.squads[newSquadId] = newSquadMem;
        const squadLead = Game.creeps[newSquadMem.members[SquadMemberType.SQUAD_LEADER]];
        squadLead.memory.combat.squadId = newSquadId;
        squadLead.memory.combat.squadMemberType = SquadMemberType.SQUAD_LEADER;
        delete squadLead.memory._m.path;
        const squadFollower = Game.creeps[newSquadMem.members[SquadMemberType.SQUAD_FOLLOWER]];
        squadFollower.memory.combat.squadId = newSquadId;
        squadFollower.memory.combat.squadMemberType = SquadMemberType.SQUAD_FOLLOWER;
        delete Game.creeps[currentSquadMem.members[SquadMemberType.SQUAD_LEADER]].memory._m.path;
    }

    public static combineDuosIntoQuad(squadId: string, squadId2: string) {
        Memory.squads[squadId].members[SquadMemberType.SQUAD_SECOND_LEADER] = Memory.squads[squadId2].members[SquadMemberType.SQUAD_LEADER];
        Memory.squads[squadId].members[SquadMemberType.SQUAD_SECOND_FOLLOWER] = Memory.squads[squadId2].members[SquadMemberType.SQUAD_FOLLOWER];
        Memory.squads[squadId].squadType = SquadType.QUAD;
        const squadLead = Game.creeps[Memory.squads[squadId2].members[SquadMemberType.SQUAD_LEADER]];
        squadLead.memory.combat.squadId = squadId;
        squadLead.memory.combat.squadMemberType = SquadMemberType.SQUAD_SECOND_LEADER;
        delete squadLead.memory._m.path;
        const squadFollower = Game.creeps[Memory.squads[squadId2].members[SquadMemberType.SQUAD_FOLLOWER]];
        squadFollower.memory.combat.squadId = squadId;
        squadFollower.memory.combat.squadMemberType = SquadMemberType.SQUAD_SECOND_FOLLOWER;
        delete Memory.squads[squadId2];
        delete Memory.squads[squadId].nextDirection;
    }

    private duoPathing(range: number) {
        if (this.onFirstCreep()) {
            if (this.isSquadFatigued()) {
                return;
            }

            if (this.forcedDestinations?.length) {
                let nextDestination = this.forcedDestinations[0];
                if (this.squadLeader.pos.toMemSafe() === nextDestination) {
                    Memory.squads[this.squadId].forcedDestinations = this.forcedDestinations.slice(1);
                    nextDestination = this.forcedDestinations[0];
                }
                this.squadLeader.travelTo(nextDestination.toRoomPos());
            } else if (Game.flags.squadMove?.pos?.roomName === this.assignment) {
                // Manual Pathing
                this.squadLeader.travelTo(Game.flags.squadMove);
            } else if (this.squadLeader.hits / this.squadLeader.hitsMax < 0.7) {
                this.squadLeader.travelToRoom(this.squadLeader.homeroom?.name);
            } else if (this.squadLeader.pos.roomName !== this.assignment || this.squadFollower.pos.roomName !== this.assignment) {
                this.squadLeader.travelToRoom(this.assignment);
            } else {
                const target = this.findPathingTarget();
                if (this.squadLeader.memory._m.path) {
                    this.nextDirection = parseInt(this.squadLeader.memory._m.path[0], 10) as DirectionConstant;
                    if (this.getObstacleStructure()) {
                        return;
                    }
                }

                if (target instanceof Creep) {
                    if (target.onEdge()) {
                        return; // Do not move out of the room to chase target
                    } else if (this.squadLeader.pos.isNearTo(target)) {
                        // Close Range movement to stick to the enemy
                        this.squadLeader.move(this.squadLeader.pos.getDirectionTo(target));
                    } else {
                        this.squadLeader.travelTo(target, { range: range, maxRooms: 1 });
                    }
                } else if (target) {
                    const customCostMatrix = this.getDuoMatrix(this.squadLeader);
                    this.squadLeader.travelTo(target, {
                        range: 1,
                        ignoreStructures: true,
                        maxRooms: 1,
                        customMatrixCosts: customCostMatrix.concat(
                            this.squadLeader.room.myCreeps
                                .filter((myCreep) => myCreep.memory?.combat?.squadId !== this.squadLeader.memory.combat.squadId)
                                .map((myCreep) => ({ x: myCreep.pos.x, y: myCreep.pos.y, cost: 255 }))
                        ),
                    });
                }
            }
            // TODO: make squadLeader find a position to the right or left of leader to go into room for exit rampart (even better make them go into the room at the same time)
            this.squadFollower.move(this.squadFollower.pos.getDirectionTo(this.squadLeader));
        }
    }

    private findPathingTarget(): Structure {
        let target;
        if (this.targetStructure && Game.getObjectById(this.targetStructure)) {
            target = Game.getObjectById(this.targetStructure);
        } else if (this.squadLeader.pos.roomName === this.assignment) {
            const structuresToSearch = this.squadLeader.room.hostileStructures.filter(
                (struct) =>
                    struct.structureType !== STRUCTURE_KEEPER_LAIR &&
                    struct.structureType !== STRUCTURE_LAB &&
                    struct.structureType !== STRUCTURE_NUKER &&
                    struct.structureType !== STRUCTURE_TERMINAL &&
                    struct.structureType !== STRUCTURE_STORAGE &&
                    struct.structureType !== STRUCTURE_CONTROLLER
            );

            target = this.squadLeader.pos.findClosestByRange(structuresToSearch, {
                filter: (struct) => struct.structureType === STRUCTURE_TOWER,
            }) as Structure;
            if (!target) {
                target = this.squadLeader.pos.findClosestByRange(structuresToSearch, {
                    filter: (struct) => struct.structureType === STRUCTURE_SPAWN,
                }) as Structure;
            }
            if (!target) {
                target = this.squadLeader.pos.findClosestByRange(structuresToSearch, {
                    filter: (struct) => struct.hits > 0 && struct.hits < 50000,
                });
            }

            if (!target) {
                target = this.squadLeader.pos.findClosestByRange(structuresToSearch, {
                    filter: (struct) => struct.hits > 0,
                });
            }
        }

        if (
            target &&
            (target.structureType !== STRUCTURE_POWER_BANK ||
                !this.squadLeader.room.hostileCreeps.some(
                    (creep) =>
                        creep.body.some((bodyPart) => bodyPart.type === ATTACK || bodyPart.type === RANGED_ATTACK) &&
                        this.squadLeader.pos.getRangeTo(creep) <= 5
                ))
        ) {
            this.targetStructure = target?.id;
        } else {
            target = this.findHostileCreep();
        }

        return target;
    }

    private findHostileCreep() {
        return this.squadLeader.pos.findClosestCreepByRange(true);
    }

    /**
     * Get any structure that is blocking us since pathing takes a direct route by default
     * TODO: make it so that creeps dont go diagonally after getting through wall/rampart
     * @returns
     */
    public getObstacleStructure(): Structure {
        if (!this.currentCreep.onEdge() && this.nextDirection && !this.missingCreeps()) {
            let enemyStructure = Pathing.positionAtDirection(this.squadLeader.pos, this.nextDirection)
                ?.lookFor(LOOK_STRUCTURES)
                .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
            if (enemyStructure.length) {
                return enemyStructure[0];
            }
            if (this.isPartOfQuad()) {
                if (!this.squadFollower.onEdge()) {
                    enemyStructure = Pathing.positionAtDirection(this.squadFollower.pos, this.nextDirection)
                        ?.lookFor(LOOK_STRUCTURES)
                        .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                    if (enemyStructure.length) {
                        return enemyStructure[0];
                    }
                }
                if (!this.squadSecondLeader.onEdge()) {
                    enemyStructure = Pathing.positionAtDirection(this.squadSecondLeader.pos, this.nextDirection)
                        ?.lookFor(LOOK_STRUCTURES)
                        .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                    if (enemyStructure.length) {
                        return enemyStructure[0];
                    }
                }
                enemyStructure = Pathing.positionAtDirection(this.squadSecondFollower.pos, this.nextDirection)
                    ?.lookFor(LOOK_STRUCTURES)
                    .filter((struct) => struct.structureType !== STRUCTURE_ROAD && struct.structureType !== STRUCTURE_CONTAINER);
                if (enemyStructure.length) {
                    return enemyStructure[0];
                }
            }
        }
    }

    private findPath(target: any, range: number): PathFinderPath {
        const matrix = SquadManagement.getQuadMatrix(this.squadLeader, this.assignment, this.orientation, this.anchor).concat(
            this.squadLeader.room.myCreeps
                .filter((myCreep) => myCreep.memory?.combat?.squadId !== this.squadLeader.memory.combat.squadId)
                .map((myCreep) => ({ x: myCreep.pos.x, y: myCreep.pos.y, cost: 255 }))
        );

        if (Game.flags.squadMove?.pos?.roomName === this.assignment) {
            // Manual targeting (costMatrix disabled?)
            return Pathing.findTravelPath(this.squadLeader, this.squadLeader.pos, Game.flags.squadMove.pos, { customMatrixCosts: matrix });
        }
        if (this.squadLeader.memory._m.lastCoord.toRoomPos().roomName !== this.squadLeader.pos.roomName) {
            delete this.squadLeader.memory._m.path;
        }
        if (target && !this.squadLeader.memory._m.path) {
            let options: TravelToOpts = { exitCost: 50, maxRooms: 1, efficiency: 10 };
            if (!this.isSquadOnExit()) {
                options.customMatrixCosts = matrix;
            }
            if (!target) {
                options.range = 22;
                return Pathing.findTravelPath(
                    this.squadLeader,
                    this.squadLeader.pos,
                    new RoomPosition(25, 25, this.squadLeader.pos.roomName),
                    options
                );
            } else if (target instanceof Creep) {
                options.range = range;
                options.ignoreStructures = true;
                return Pathing.findTravelPath(this.squadLeader, this.squadLeader.pos, target.pos, options);
            } else {
                options.ignoreStructures = true;
                options.range = 1;
                return Pathing.findTravelPath(this.squadLeader, this.squadLeader.pos, target.pos, options);
            }
        } else if (this.squadLeader.pos.roomName !== this.assignment) {
            return Pathing.findTravelPath(this.squadLeader, this.squadLeader.pos, new RoomPosition(25, 25, this.squadLeader.pos.roomName), {
                customMatrixCosts: matrix,
            });
        }
        return;
    }

    private inTargetRoom(): boolean {
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

        if (!lookObject.some((look) => look.terrain === 'wall')) {
            this.squadLeader.memory._m.path = this.squadLeader.memory._m.path.slice(1);
            this.squadLeader.move(this.nextDirection);
            this.squadFollower.move(this.nextDirection);
            this.squadSecondLeader.move(this.nextDirection);
            this.squadSecondFollower.move(this.nextDirection);
        }
    }

    private getDuoMatrix(creep: Creep): CustomMatrixCost[] {
        const roomName = creep.room.name;
        if (!global.duoMatrix) {
            global.duoMatrix = {};
        }
        if (global.duoMatrix[roomName]) {
            return global.duoMatrix[roomName];
        }

        const customCostMatrix: CustomMatrixCost[] = [];

        // Enemy Structures
        Game.rooms[roomName].structures
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

    private static getQuadMatrix(
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
            Game.rooms[roomName].structures
                .filter((structure) => structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL)
                .forEach((blockade) => {
                    let cost = 50;
                    if (blockade.hits < 15000000) {
                        cost += Math.floor(blockade.hits / 200000);
                    } else {
                        cost += 75 + Math.floor(blockade.hits / 3000000);
                    }
                    customCostMatrix.push({ x: blockade.pos.x, y: blockade.pos.y, cost: cost });
                    this.directionalCostMatrix(
                        customCostMatrix,
                        terrain,
                        blockade.pos.x,
                        blockade.pos.y,
                        roomName,
                        orientation,
                        anchor,
                        false,
                        Math.floor(cost / 5)
                    );
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
                        this.directionalCostMatrix(customCostMatrix, terrain, x, y, roomName, orientation, anchor, false);
                    }
                }
            }
        }
        global.quadMatrix[quadKey] = customCostMatrix;
        return global.quadMatrix[quadKey];
    }

    private static directionalCostMatrix(
        customCostMatrix: CustomMatrixCost[],
        terrain: RoomTerrain,
        x: number,
        y: number,
        roomName: string,
        orientation: TOP | RIGHT | BOTTOM | LEFT,
        anchor: LEFT | RIGHT,
        enableVisuals: boolean,
        cost: number = 255
    ) {
        let avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), orientation);
        if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
            SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
        }

        if (orientation === LEFT) {
            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), anchor === LEFT ? BOTTOM : TOP);
            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
            }
            if (x > 0) {
                avoid = Pathing.positionAtDirection(new RoomPosition(x - 1, y, roomName), anchor === LEFT ? BOTTOM : TOP);
                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                }
            }
        } else if (orientation === RIGHT) {
            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), anchor === LEFT ? TOP : BOTTOM);
            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
            }

            if (x < 49) {
                avoid = Pathing.positionAtDirection(new RoomPosition(x + 1, y, roomName), anchor === RIGHT ? BOTTOM : TOP);
                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                }
            }
        } else if (orientation === TOP) {
            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), anchor);
            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
            }
            if (y > 0) {
                avoid = Pathing.positionAtDirection(new RoomPosition(x, y - 1, roomName), anchor);
                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                }
            }
        } else {
            avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), Pathing.inverseDirection(anchor));
            if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
            }
            if (y < 49) {
                avoid = Pathing.positionAtDirection(new RoomPosition(x, y + 1, roomName), Pathing.inverseDirection(anchor));
                if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                    customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: cost });
                    SquadManagement.showVisuals(enableVisuals, new RoomPosition(avoid.x, avoid.y, roomName));
                }
            }
        }
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

    private linePathing(): void {
        if (this.onFirstCreep()) {
            if (this.isSquadFatigued()) {
                return;
            }

            if (this.forcedDestinations?.length) {
                let nextDestination = this.forcedDestinations[0];
                if (this.squadLeader.pos.toMemSafe() === nextDestination) {
                    Memory.squads[this.squadId].forcedDestinations = this.forcedDestinations.slice(1);
                    nextDestination = this.forcedDestinations[0];
                }
                this.squadLeader.travelTo(nextDestination.toRoomPos());
            } else if (this.squadLeader.pos.roomName === this.assignment) {
                this.squadLeader.travelTo(this.squadLeader.memory._m.destination.toRoomPos());
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

    private getInDuoFormation(): boolean {
        if (this.isInDuoFormation()) {
            return true;
        }
        if (this.onFirstCreep()) {
            this.squadFollower.travelTo(this.squadLeader, { range: 1 });
        }
    }

    private isInDuoFormation(): boolean {
        return this.squadLeader.pos.isNearTo(this.squadFollower) || this.squadLeader.onEdge() || this.squadFollower.onEdge();
    }

    private closeToTargetRoom(): boolean {
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
            if (this.squadLeader.memory.combat.squadTarget === SquadTarget.POWER_BANK) {
                return this.squadLeader;
            }
            const lastHealingTarget = Game.creeps[this.currentCreep.memory.combat.healingTarget];
            if (lastHealingTarget) {
                return lastHealingTarget;
            }
            return this.currentCreep;
        }
        this.currentCreep.memory.combat.healingTarget = targetCreep.name;
        return targetCreep;
    }

    private cleanUp() {
        if (this.onFirstCreep()) {
            Memory.squads[this.squadId].lastRun = Game.time;
            Memory.squads[this.squadId].isFleeing = this.isFleeing;
            if (!this.missingCreeps() && (this.isInDuoFormation() || this.isInFormation())) {
                if (this.orientation) {
                    Memory.squads[this.squadId].orientation = this.orientation;
                }
                Memory.squads[this.squadId].targetStructure = this.targetStructure;
                Memory.squads[this.squadId].nextDirection = this.nextDirection;
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
                Memory.squads[this.squadId].anchor = this.anchor;
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
                Memory.squads[this.squadId].anchor = this.anchor;
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
                Memory.squads[this.squadId].anchor = this.anchor;
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
                Memory.squads[this.squadId].anchor = this.anchor;
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

    private fleeing(): void {
        if (this.currentCreep.pos.roomName === this.assignment) {
            // Other squad Creep died in assignmentRoom
            this.currentCreep.memory.recycle = true;
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
