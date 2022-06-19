import { CombatCreep } from '../virtualCreeps/combatCreep';
import { posFromMem } from './memoryManagement';
import { Pathing } from './pathing';

export class SquadManagement {
    /**
     * Setup all necessary creeps for a duo formation.
     * @param creep target creep to add to the formation
     * @returns false, if creep is not part of the squad
     */
    public static setupDuo(creep: Creep): void {
        if (SquadManagement.isPartOfDuo(creep)) {
            creep.memory.combat.squadMembers[creep.memory.combat.squadMemberType] = creep.id;
            if (creep.memory.combat.squadMemberType === SquadMemberType.SQUAD_LEADER) {
                SquadManagement.setSquadMembers(creep, SquadMemberType.SQUAD_FOLLOWER);
            } else if (creep.memory.combat.squadMemberType === SquadMemberType.SQUAD_FOLLOWER) {
                SquadManagement.setSquadMembers(creep, SquadMemberType.SQUAD_LEADER);
            }
        }
    }

    /**
     * Setup all necessary creeps for a quad formation.
     * @param creep target creep to add to the formation
     * @returns false, if creep is not part of the quad
     */
    public static setupQuad(creep: Creep): void {
        if (SquadManagement.isPartOfQuad(creep)) {
            if (!creep.memory.combat.squadMembers) {
                creep.memory.combat.squadMembers = {};
            }
            creep.memory.combat.squadMembers[creep.memory.combat.squadMemberType] = creep.id;
            if (creep.memory.combat.squadMemberType === SquadMemberType.SQUAD_LEADER) {
                SquadManagement.setSquadMembers(
                    creep,
                    SquadMemberType.SQUAD_FOLLOWER,
                    SquadMemberType.SQUAD_SECOND_LEADER,
                    SquadMemberType.SQUAD_SECOND_FOLLOWER
                );
            } else if (creep.memory.combat.squadMemberType === SquadMemberType.SQUAD_SECOND_LEADER) {
                SquadManagement.setSquadMembers(
                    creep,
                    SquadMemberType.SQUAD_LEADER,
                    SquadMemberType.SQUAD_FOLLOWER,
                    SquadMemberType.SQUAD_SECOND_FOLLOWER
                );
            } else if (creep.memory.combat.squadMemberType === SquadMemberType.SQUAD_FOLLOWER) {
                SquadManagement.setSquadMembers(
                    creep,
                    SquadMemberType.SQUAD_LEADER,
                    SquadMemberType.SQUAD_SECOND_LEADER,
                    SquadMemberType.SQUAD_SECOND_FOLLOWER
                );
            } else if (creep.memory.combat.squadMemberType === SquadMemberType.SQUAD_SECOND_FOLLOWER) {
                SquadManagement.setSquadMembers(
                    creep,
                    SquadMemberType.SQUAD_LEADER,
                    SquadMemberType.SQUAD_FOLLOWER,
                    SquadMemberType.SQUAD_SECOND_LEADER
                );
            }
        }
    }

    private static setSquadMembers(creep: Creep, ...squadMemberTypes: SquadMemberType[]) {
        squadMemberTypes
            .filter(
                (squadMemberType) =>
                    !creep.memory.combat.squadMembers[squadMemberType] || !Game.getObjectById(creep.memory.combat.squadMembers[squadMemberType])
            )
            .forEach(
                (unsetSquadMemberType) =>
                    (creep.memory.combat.squadMembers[unsetSquadMemberType] = creep.room.creeps.find(
                        (roomCreep) =>
                            roomCreep.memory.combat?.squadMemberType === unsetSquadMemberType &&
                            roomCreep.memory.assignment === creep.memory.assignment
                    )?.id)
            );
    }

    public static isPartOfDuo(creep: Creep) {
        return creep.memory.combat.squadType === SquadType.DUO;
    }

    public static isPartOfQuad(creep: Creep) {
        return creep.memory.combat.squadType === SquadType.QUAD;
    }

    public static missingQuadCreep(creep: Creep): boolean {
        return (
            !SquadManagement.getSquadLeader(creep) ||
            !SquadManagement.getSquadFollower(creep) ||
            !SquadManagement.getSquadSecondLeader(creep) ||
            !SquadManagement.getSquadSecondFollower(creep)
        );
    }

    public static missingDuoCreep(creep: Creep): boolean {
        return !SquadManagement.getSquadLeader(creep) || !SquadManagement.getSquadFollower(creep);
    }

    public static getIntoFormation(creep: Creep): boolean {
        if (SquadManagement.isInFormation(creep)) {
            return true;
        }
        if (SquadManagement.getCurrentSquadMemberType(creep) === SquadMemberType.SQUAD_LEADER) {
            const squadSecondLeader = SquadManagement.getSquadSecondLeader(creep);
            const squadSecondLeaderTargetPos = SquadManagement.findPositionNextToLeader(creep);
            squadSecondLeader.travelTo(squadSecondLeaderTargetPos);

            const inverseDirection = Pathing.inverseDirection(creep.pos.getDirectionTo(posFromMem(creep.memory._m.destination)));
            SquadManagement.getSquadFollower(creep).travelTo(
                SquadManagement.findPositionBehind(creep.pos, squadSecondLeaderTargetPos, inverseDirection, SquadMemberType.SQUAD_FOLLOWER)
            ); // TODO issue here
            SquadManagement.getSquadSecondFollower(creep).travelTo(
                SquadManagement.findPositionBehind(creep.pos, squadSecondLeaderTargetPos, inverseDirection, SquadMemberType.SQUAD_SECOND_FOLLOWER)
            );
        }

        return false;
    }

    public static getInLineFormation(creep: Creep): boolean {
        if (SquadManagement.isInLineFormation(creep)) {
            return true;
        }

        if (SquadManagement.getCurrentSquadMemberType(creep) === SquadMemberType.SQUAD_LEADER) {
            const squadFollower = SquadManagement.getSquadFollower(creep);
            squadFollower.travelTo(creep, { range: 1 });

            const squadSecondLeader = SquadManagement.getSquadSecondLeader(creep);
            squadSecondLeader.travelTo(squadFollower, { range: 1 });

            const squadSecondFollower = SquadManagement.getSquadSecondFollower(creep);
            squadSecondFollower.travelTo(squadSecondLeader, { range: 1 });
        }
    }

    public static formationPathing(creep: Creep, range: number): void {
        if (SquadManagement.getCurrentSquadMemberType(creep) === SquadMemberType.SQUAD_LEADER) {
            const squadFollower = SquadManagement.getSquadFollower(creep);
            const squadSecondLeader = SquadManagement.getSquadSecondLeader(creep);
            const squadSecondFollower = SquadManagement.getSquadSecondFollower(creep);

            if (creep.fatigue || squadFollower.fatigue || squadSecondFollower.fatigue || squadSecondLeader.fatigue) {
                return;
            }

            if (
                squadSecondFollower.pos.roomName !== creep.memory.assignment ||
                squadFollower.pos.roomName !== creep.memory.assignment ||
                squadSecondLeader.pos.roomName !== creep.memory.assignment
            ) {
                if (creep.pos.roomName !== creep.memory.assignment) {
                    const direction = Game.map.findExit(creep.pos.roomName, creep.memory.assignment);
                    creep.memory._m.path = `${direction}${direction}${direction}`; // move in same direction to ensure every creep is on the other side (TODO: technically only 2 can be ensured)
                }
                const nextDirection = parseInt(creep.memory._m.path[0], 10) as DirectionConstant;
                creep.memory._m.path = creep.memory._m.path.slice(1);

                creep.move(nextDirection);
                squadSecondLeader.move(nextDirection);
                if (squadFollower.pos.getRangeTo(creep) > 1) {
                    squadFollower.travelTo(creep, { range: 1 });
                } else {
                    squadFollower.move(nextDirection);
                }
                if (squadSecondFollower.pos.getRangeTo(squadSecondLeader) > 1) {
                    squadSecondFollower.travelTo(squadSecondLeader, { range: 1 });
                } else {
                    squadSecondFollower.move(nextDirection);
                }
                return;
            }

            // TODO: optimize ==> save structures in memory and only check for creeps
            let target = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
                filter: (struct) => struct.structureType === STRUCTURE_TOWER,
            }) as any;
            if (!target) {
                target = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType === STRUCTURE_SPAWN });
            }
            if (!target) {
                target = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
            }
            if (!target) {
                target = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES);
            }

            let squadLeadResult;
            if (!target) {
                squadLeadResult = creep.travelTo(new RoomPosition(25, 25, creep.pos.roomName), {
                    range: 22,
                    exitCost: 10,
                    customMatrixCosts: SquadManagement.getQuadMatrix(creep),
                });
            } else if (target instanceof Creep) {
                squadLeadResult = creep.travelTo(target, { range: range, exitCost: 10, customMatrixCosts: SquadManagement.getQuadMatrix(creep) });
            } else {
                squadLeadResult = creep.travelTo(target, {
                    range: 0,
                    exitCost: 10,
                    ignoreStructures: true,
                    customMatrixCosts: SquadManagement.getQuadMatrix(creep),
                });
                creep.memory.targetId = target.id;
                squadSecondLeader.memory.targetId = target.id;
            }
            if (squadLeadResult === OK) {
                const nextDirection = parseInt(creep.memory._m.path[0], 10) as DirectionConstant;
                squadSecondLeader.move(nextDirection);
                squadFollower.move(nextDirection);
                squadSecondFollower.move(nextDirection);
            }
        }
    }

    // TODO: do not recalculate every tick? Find a better way to ensure 2 wide paths. 255 changes depending on where creep is facing (always pick same side to reduce cpu cost and move this into pathing?)
    public static getQuadMatrix(creep: Creep, inPreviousRoom?: boolean): CustomMatrixCost[] {
        const customCostMatrix: CustomMatrixCost[] = [];
        let direction: DirectionConstant;
        const exits = Game.map.describeExits(creep.room.name);

        if (!inPreviousRoom) {
            const directionToSecondSquadLeader = creep.pos.getDirectionTo(SquadManagement.getSquadSecondLeader(creep));
            direction = Pathing.inverseDirection(directionToSecondSquadLeader);
        }
        const roomName = creep.room.name;
        const terrain = new Room.Terrain(roomName);
        let y = 0;
        let maxY = 50;
        let x = 0;
        let maxX = 50;
        // Ensure there are spaces around exit to make a formation
        if (inPreviousRoom) {
            if (exits['1'] === creep.memory.assignment) {
                maxY = 2;
            } else if (exits['3'] === creep.memory.assignment) {
                x = 47;
            } else if (exits['5'] === creep.memory.assignment) {
                y = 47;
            } else if (exits['7'] === creep.memory.assignment) {
                maxX = 2;
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
                        const avoid = Pathing.positionAtDirection(new RoomPosition(x, y, roomName), direction);
                        if (avoid && terrain.get(avoid.x, avoid.y) !== TERRAIN_MASK_WALL) {
                            // could happen that there are no paths
                            customCostMatrix.push({ x: avoid.x, y: avoid.y, cost: 255 });
                        }
                        // Avoid going close to walls if possible
                        if (direction === LEFT || direction === RIGHT) {
                            if (terrain.get(x, y - 1) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: x, y: y - 1, cost: 30 });
                            }
                            if (terrain.get(x, y + 1) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: x, y: y + 1, cost: 30 });
                            }
                        } else if (direction === TOP || direction === BOTTOM) {
                            if (terrain.get(x - 1, y) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: x - 1, y: y, cost: 30 });
                            }
                            if (terrain.get(x + 1, y) !== TERRAIN_MASK_WALL) {
                                customCostMatrix.push({ x: x + 1, y: y, cost: 30 });
                            }
                        }
                    }
                }
            }
        }

        return customCostMatrix;
    }

    public static linePathing(creep: Creep): void {
        if (SquadManagement.getCurrentSquadMemberType(creep) === SquadMemberType.SQUAD_LEADER) {
            const squadFollower = SquadManagement.getSquadFollower(creep);
            const squadSecondLeader = SquadManagement.getSquadSecondLeader(creep);
            const squadSecondFollower = SquadManagement.getSquadSecondFollower(creep);
            if (creep.fatigue || squadFollower.fatigue || squadSecondLeader.fatigue || squadSecondLeader.fatigue) {
                return;
            }
            const exits = Game.map.describeExits(creep.room.name);
            if (Object.values(exits).find((exit) => exit === creep.memory.assignment)) {
                creep.travelToRoom(creep.memory.assignment, { customMatrixCosts: SquadManagement.getQuadMatrix(creep, true) });
            } else {
                if (creep.memory.combat.forcedDestinations?.length) {
                    let nextDestination = creep.memory.combat.forcedDestinations[0];
                    if (creep.pos.toMemSafe() === nextDestination) {
                        creep.memory.combat.forcedDestinations = creep.memory.combat.forcedDestinations.slice(1);
                        nextDestination = creep.memory.combat.forcedDestinations[0];
                    }
                    creep.travelTo(posFromMem(nextDestination));
                } else {
                    creep.travelToRoom(creep.memory.assignment);
                }
            }
            if (squadFollower.pos.getRangeTo(creep) > 1) {
                squadFollower.travelTo(creep, { range: 1 });
            } else {
                squadFollower.move(squadFollower.pos.getDirectionTo(creep));
            }
            if (squadSecondLeader.pos.getRangeTo(squadFollower) > 1) {
                squadSecondLeader.travelTo(squadFollower, { range: 1 });
            } else {
                squadSecondLeader.move(squadSecondLeader.pos.getDirectionTo(squadFollower));
            }
            if (squadSecondFollower.pos.getRangeTo(squadSecondLeader) > 1) {
                squadSecondFollower.travelTo(squadSecondLeader, { range: 1 });
            } else {
                squadSecondFollower.move(squadSecondFollower.pos.getDirectionTo(squadSecondLeader));
            }
        }
    }

    private static isInLineFormation(creep: Creep): boolean {
        const squadLeader = SquadManagement.getSquadLeader(creep);
        const squadFollower = SquadManagement.getSquadFollower(creep);
        const squadSecondLeader = SquadManagement.getSquadSecondLeader(creep);
        const squadSecondFollower = SquadManagement.getSquadSecondFollower(creep);

        if (squadLeader.onEdge() || squadFollower.onEdge() || squadSecondLeader.onEdge() || squadSecondFollower.onEdge()) {
            return true;
        }

        return (
            squadLeader.pos.isNearTo(squadFollower) &&
            squadFollower.pos.isNearTo(squadSecondLeader) &&
            squadSecondLeader.pos.isNearTo(squadSecondFollower)
        );
    }

    private static isInFormation(creep: Creep): boolean {
        const squadLeader = SquadManagement.getSquadLeader(creep);
        const squadFollower = SquadManagement.getSquadFollower(creep);
        const squadSecondLeader = SquadManagement.getSquadSecondLeader(creep);
        const squadSecondFollower = SquadManagement.getSquadSecondFollower(creep);

        if (
            creep.pos.x !== 1 &&
            creep.pos.x !== 48 &&
            creep.pos.y !== 1 &&
            creep.pos.y !== 48 &&
            (squadLeader.onEdge() || squadFollower.onEdge() || squadSecondLeader.onEdge() || squadSecondFollower.onEdge())
        ) {
            // while going through exits but exclude setting up formation
            return true;
        }

        return (
            squadLeader.pos.isNearTo(squadFollower) &&
            squadLeader.pos.isNearTo(squadSecondLeader) &&
            squadLeader.pos.isNearTo(squadSecondFollower) &&
            squadSecondLeader.pos.isNearTo(squadSecondFollower) &&
            squadSecondLeader.pos.isNearTo(squadFollower) &&
            squadFollower.pos.isNearTo(squadSecondFollower)
        );
    }

    public static getInDuoFormation(creep: Creep): boolean {
        if (SquadManagement.isInDuoFormation(creep)) {
            return true;
        }
        SquadManagement.getSquadFollower(creep).travelTo(SquadManagement.getSquadLeader(creep), { range: 1, reusePath: 0 });
    }

    private static isInDuoFormation(creep: Creep): boolean {
        return SquadManagement.getSquadLeader(creep).pos.isNearTo(SquadManagement.getSquadFollower(creep));
    }

    public static getSquadLeader(creep: Creep): Creep {
        if (!creep.memory.combat?.squadMembers || !creep.memory.combat?.squadMembers[SquadMemberType.SQUAD_LEADER]) {
            return undefined;
        }
        return Game.getObjectById(creep.memory.combat.squadMembers[SquadMemberType.SQUAD_LEADER]);
    }

    public static getSquadFollower(creep: Creep): Creep {
        if (!creep.memory.combat?.squadMembers || !creep.memory.combat?.squadMembers[SquadMemberType.SQUAD_FOLLOWER]) {
            return undefined;
        }
        return Game.getObjectById(creep.memory.combat.squadMembers[SquadMemberType.SQUAD_FOLLOWER]);
    }

    public static getSquadSecondLeader(creep: Creep): Creep {
        if (!creep.memory.combat?.squadMembers || !creep.memory.combat?.squadMembers[SquadMemberType.SQUAD_SECOND_LEADER]) {
            return undefined;
        }
        return Game.getObjectById(creep.memory.combat.squadMembers[SquadMemberType.SQUAD_SECOND_LEADER]);
    }

    public static getSquadSecondFollower(creep: Creep): Creep {
        if (!creep.memory.combat?.squadMembers || !creep.memory.combat?.squadMembers[SquadMemberType.SQUAD_SECOND_FOLLOWER]) {
            return undefined;
        }
        return Game.getObjectById(creep.memory.combat.squadMembers[SquadMemberType.SQUAD_SECOND_FOLLOWER]);
    }

    public static closeToTargetRoom(creep: Creep): boolean {
        if (SquadManagement.getCurrentSquadMemberType(creep) === SquadMemberType.SQUAD_LEADER) {
            const { x, y } = Pathing.normalizePos(creep.pos);
            const exits = Game.map.describeExits(creep.room.name);
            if (creep.memory._m.destination === creep.pos.toMemSafe()) {
                // forced destinations
                return false;
            }
            const nextDirection = creep.pos.getDirectionTo(posFromMem(creep.memory._m.destination));
            const nextPosition = Pathing.positionAtDirection(creep.pos, nextDirection);
            if (!Pathing.isExit(nextPosition) || creep.room.getTerrain().get(nextPosition.x, nextPosition.y) === TERRAIN_MASK_WALL) {
                return false;
            }
            if (x <= 1 && exits['7'] === creep.memory.assignment) {
                return true;
            }
            if (y <= 1 && exits['1'] === creep.memory.assignment) {
                return true;
            }
            if (x >= 48 && exits['3'] === creep.memory.assignment) {
                return true;
            }
            if (y >= 48 && exits['5'] === creep.memory.assignment) {
                return true;
            }
        }
        return false;
    }

    private static rotate(creep: Creep, direction: DirectionConstant) {}

    private static getCurrentSquadMemberType(creep: Creep): SquadMemberType {
        return creep.memory.combat.squadMemberType;
    }

    public static getSquadHealingTarget(creep: Creep): Creep {
        const squadMembers = Object.values(creep.memory.combat.squadMembers)
            .filter((squadMemberIds) => !!squadMemberIds)
            .map((squadMemberId) => Game.getObjectById(squadMemberId))
            .filter((squadMembers) => !!squadMembers);
        if (!squadMembers.length) {
            return undefined;
        }
        if (squadMembers.length === 1) {
            return squadMembers[0];
        }
        const targetCreep = squadMembers.reduce((lowestHPSquadMember, nextSquadMember) => {
            if (!nextSquadMember || lowestHPSquadMember.hits / lowestHPSquadMember.hitsMax < nextSquadMember.hits / nextSquadMember.hitsMax) {
                return lowestHPSquadMember;
            }
            return nextSquadMember;
        });

        if (targetCreep.hits === targetCreep.hitsMax) {
            // everybody is full health
            return creep;
        }
        return targetCreep;
    }

    private static findPositionNextToLeader(creep: Creep): RoomPosition {
        const leader = SquadManagement.getSquadLeader(creep);
        const leaderPos = leader.pos;
        let nextDirection = leaderPos.getDirectionTo(posFromMem(creep.memory._m.destination));

        const terrain = creep.room.getTerrain();
        let offset = 2;
        if (nextDirection % 2 === 0) {
            offset--;
        }
        const directionToSideA = ((nextDirection + offset) % 8) as DirectionConstant;
        const directionToSideB = ((nextDirection + offset + 4) % 8) as DirectionConstant;
        const sideAPos = Pathing.positionAtDirection(leaderPos, directionToSideA);
        const sideANextPos = Pathing.positionAtDirection(sideAPos, nextDirection);
        if (!sideANextPos || terrain.get(sideANextPos.x, sideANextPos.y) !== TERRAIN_MASK_WALL) {
            return sideAPos;
        }
        return Pathing.positionAtDirection(leaderPos, directionToSideB);
    }

    private static findPositionBehind(
        leaderPos: RoomPosition,
        secondLeaderPos: RoomPosition,
        inverseDirection: DirectionConstant,
        squadMemberType: SquadMemberType
    ): RoomPosition {
        let targetPos: RoomPosition;
        if (squadMemberType === SquadMemberType.SQUAD_SECOND_FOLLOWER) {
            targetPos = new RoomPosition(secondLeaderPos.x, secondLeaderPos.y, secondLeaderPos.roomName);
        } else {
            targetPos = new RoomPosition(leaderPos.x, leaderPos.y, leaderPos.roomName);
        }

        if (leaderPos.y === secondLeaderPos.y) {
            if (inverseDirection > 6 || inverseDirection < 4) {
                targetPos.y--;
            } else {
                targetPos.y++;
            }
        } else {
            if (inverseDirection > 1 || inverseDirection < 5) {
                targetPos.x++;
            } else {
                targetPos.x--;
            }
        }

        return targetPos;
    }

    public static fleeing(creep: CombatCreep): void {
        if (creep.pos.roomName === creep.memory.assignment) {
            // Creep died
            creep.flee();
        } else if (creep.pos.roomName === creep.homeroom.name) {
            // Wait close to exit for whole squad
            const { x, y } = Pathing.normalizePos(creep.pos);
            if (x > 4 && x < 46 && y > 4 && y < 46) {
                creep.travelToRoom(creep.memory.assignment);
            }
        } else {
            creep.moveOffExit();
        }
    }
}
