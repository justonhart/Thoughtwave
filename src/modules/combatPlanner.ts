import { CombatCreep } from '../virtualCreeps/combatCreep';
import { CombatIntel } from './combatIntel';
import { PopulationManagement } from './populationManagement';

export class CombatPlanner {
    private detectedEarlyThreat: boolean;
    private numRampartProtectors: number;
    private currentRampartProtectors: Creep[];
    private room: Room;
    private turretTarget: Creep;
    private exitRooms: string[];

    public constructor(room: Room) {
        try {
            this.room = room;
            switch (room.memory.roomType) {
                case RoomType.HOMEROOM:
                    this.numRampartProtectors = PopulationManagement.currentNumRampartProtectors(room.name);
                    this.currentRampartProtectors = room.myCreeps.filter((creep) => creep.memory.role === Role.RAMPART_PROTECTOR);
                    this.exitRooms = Object.values(Game.map.describeExits(room.name));
                    this.detectedEarlyThreat = this.hasEarlyDetectionThreat();
                    this.defendHomeRoom();
                    break;
            }
        } catch (e) {
            console.log(`Error caught for CombatPlanner in ${room.name}: \n${e}`);
        }
    }

    public defendHomeRoom() {
        // No Defense needed
        if (
            this.room.controller.safeMode > 150 ||
            (this.room.memory.threatLevel <= HomeRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS && !this.detectedEarlyThreat)
        ) {
            this.runTowersForHeal();
            this.recycleRampartProtectors();
            this.removeVisionOperation();
            return;
        }

        // Threat detected around the homeroom
        if (this.detectedEarlyThreat) {
            this.handleEarlyThreatDetection();
            this.createVisionOperation();
        }

        // Run Towers
        const needActiveDefense = this.runTowers();

        // Spawn in Rampart Protectors and send scouts to keep vision of surrounding rooms
        if (needActiveDefense) {
            this.spawnActiveDefense();
        }

        // Set defense positions (should run even when activeDefense is no longer needed)
        this.runDefensePositions();
    }

    public defendRemoteMiningRoom(room: Room) {
        if (Memory.remoteData[room.name].threatLevel === RemoteRoomThreatLevel.SAFE) {
            return;
        }
    }

    /**
     * Spawn Active Defense (rampart protectors).
     * TODO: For now it spawns one protector for each "aggressive" unit. This can later be optimized to minimize the number of protectors spawned in.
     * TODO: We also always spawn max protectors (we can optimize that to spawn only what is necessary to keep enemies away and then spawn in additional ones for the kill allowing faster response times)
     * @param room
     * @returns
     */
    private spawnActiveDefense(): void {
        let numNeededProtectors = this.getAggressiveHostileCreeps(this.room).length - this.numRampartProtectors;
        while (numNeededProtectors > 0) {
            this.createRampartProtector();
            numNeededProtectors--;
        }
    }

    private createRampartProtector(): void {
        const parts = this.room.controller.level < 4 ? [RANGED_ATTACK, MOVE] : [ATTACK, MOVE];
        const boostParts = [BoostType.ATTACK, BoostType.MOVE];
        const body = PopulationManagement.createDynamicCreepBody(this.room, parts, 9999, 0, { boosts: boostParts });
        Memory.spawnAssignments.push({
            designee: this.room.name,
            body: body,
            spawnOpts: {
                boosts: boostParts,
                memory: {
                    role: Role.RAMPART_PROTECTOR,
                    room: this.room.name,
                    assignment: this.room.name,
                    currentTaskPriority: Priority.HIGH,
                    combat: { flee: false },
                },
            },
        });
    }

    private recycleRampartProtectors(): void {
        this.currentRampartProtectors.forEach((creep) => (creep.memory.recycle = true));
        Memory.spawnAssignments = Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.role !== Role.RAMPART_PROTECTOR || creep.spawnOpts.memory.room !== this.room.name
        );
    }

    private hasEarlyDetectionThreat() {
        return this.exitRooms.some((exitRoomName) => Memory.roomData[exitRoomName]?.threatDetected);
    }

    /**
     * Spawn in one protector early if threats are around the room.
     * @param roomName
     */
    private handleEarlyThreatDetection(): void {
        if (!this.numRampartProtectors) {
            Game.notify(`Early detection system for Room ${this.room.name} detected at ${Game.time}!`);
            this.createRampartProtector();
        }
    }

    /**
     * Runs tower defense (attacking + healing)
     * @param room
     * @returns Threat handled by towers (false) or need active defense (true)
     */
    private runTowers(): boolean {
        const towers = this.runTowersForHeal();

        // Loop through all enemies and get the one it can kill the fastest
        let needActiveDefense = false;
        let targetCreepInfo = { creep: undefined, predictedDamage: 0 };
        this.room.hostileCreeps
            .filter((creep) => !Memory.playersToIgnore?.includes(creep.owner.username))
            .forEach((creep) => {
                const hostileCreepInfo = CombatIntel.getCreepCombatData(this.room, true, creep.pos);
                const myCreepInfo = CombatIntel.getCreepCombatData(this.room, false, creep.pos);
                const myTowerInfo = CombatIntel.getTowerCombatData(this.room, false, creep.pos);
                const predictedDamage = CombatIntel.getPredictedDamage(
                    myTowerInfo.dmgAtPos + myCreepInfo.totalDmg,
                    hostileCreepInfo.highestDmgMultiplier,
                    hostileCreepInfo.highestToughHits
                );
                if (!needActiveDefense && predictedDamage < hostileCreepInfo.totalHeal) {
                    needActiveDefense = true;
                }
                if (!targetCreepInfo.creep || targetCreepInfo.predictedDamage < predictedDamage) {
                    targetCreepInfo = { creep: creep, predictedDamage: predictedDamage };
                }
            });
        if (targetCreepInfo.creep) {
            this.turretTarget = targetCreepInfo.creep;
            towers.forEach((tower) => tower.attack(targetCreepInfo.creep));
        }
        return needActiveDefense;
    }

    /**
     * Heal hurt Creeps using towers.
     * @returns Return all towers that have not healed
     */
    private runTowersForHeal(): StructureTower[] {
        let towers = this.room.myStructures.filter((structure) => structure.structureType === STRUCTURE_TOWER) as StructureTower[];

        const myHurtCreeps = this.room.myCreeps.filter((creep) => creep.hits < creep.hitsMax);
        if (myHurtCreeps.length) {
            for (let i = 0; i < myHurtCreeps.length && towers.length; i++) {
                let healNeeded = myHurtCreeps[i].hitsMax - myHurtCreeps[i].hits;
                for (let j = 0; j < towers.length; j++) {
                    if (healNeeded <= 0) {
                        towers.splice(0, j); // N Towers have been used to heal creep so remove them from further actions
                        break;
                    }

                    const tower = towers[j];
                    healNeeded -= CombatIntel.calculateTotal([tower], myHurtCreeps[i].pos, CombatIntel.towerMinHeal, CombatIntel.towerMaxHeal);
                    tower.heal(myHurtCreeps[i]);
                    if (j === towers.length - 1) {
                        towers = []; // All towers were needed to heal creep so remove all towers from further actions
                        break;
                    }
                }
            }
        }

        return towers;
    }

    private getAggressiveHostileCreeps(targetRoom?: Room): Creep[] {
        if (!targetRoom) {
            targetRoom = this.room;
        }
        return targetRoom.hostileCreeps.filter(
            (hostileCreep) =>
                hostileCreep.getActiveBodyparts(WORK) || hostileCreep.getActiveBodyparts(RANGED_ATTACK) || hostileCreep.getActiveBodyparts(ATTACK)
        );
    }

    /**
     * Create vision operation which sends scouts to all exit rooms. These Scouts will flee from all enemies to try and stay alive.
     */
    private createVisionOperation(): void {}

    /**
     * Threat is over so remove currently running vision operation
     */
    private removeVisionOperation(): void {}

    /**
     * Set Rampart Protectors pathing target
     */
    private runDefensePositions(): void {
        const availableProtectors = this.currentRampartProtectors;
        // TODO: make it so roomDesign does not put any structures on the defense line
        let availableRamparts = this.room.myStructures.filter(
            (structure) =>
                structure.structureType === STRUCTURE_RAMPART && this.room.memory.miningAssignments[structure.pos.toMemSafe()] === undefined
        ) as StructureRampart[];

        // Check homeroom
        if (!availableRamparts.length) {
            //this.setCreepTarget(); TODO: enable nonrampart combat
        } else {
            this.getAggressiveHostileCreeps().forEach((hostileCreep) => {
                if (!availableProtectors.length || !availableRamparts.length) {
                    return;
                }
                const closestRampart = this.getClosestRampart(hostileCreep, availableRamparts);
                const closestProtector = closestRampart.pos.findClosestByRange(availableProtectors);
                (closestProtector.memory as RampartProtectorMemory).targetPos = closestRampart.pos.toMemSafe();

                // If this rampart is near a tower targeted creep then ensure rampart protector attacks that creep as well
                if (hostileCreep.id === this.turretTarget?.id && closestProtector.pos.isNearTo(hostileCreep)) {
                    closestProtector.memory.targetId = hostileCreep.id;
                }

                // Remove protector/rampart from being used again
                availableProtectors.splice(
                    this.currentRampartProtectors.findIndex((protector) => protector.id === closestProtector.id),
                    1
                );
                availableRamparts.splice(
                    availableRamparts.findIndex((rampart) => rampart.id === closestRampart.id),
                    1
                );
            });
        }

        // Check Exit Rooms
        this.exitRooms
            .filter((exitRoom) => Game.rooms[exitRoom])
            .forEach((visibleExitRoom) => {
                const room = Game.rooms[visibleExitRoom];
                this.getAggressiveHostileCreeps(room).forEach((hostileCreep) => {
                    if (!availableProtectors.length || !availableRamparts.length) {
                        return;
                    }
                    const closestRampart = this.getClosestRampart(hostileCreep, availableRamparts);
                    const closestProtector = closestRampart.pos.findClosestByRange(availableProtectors);
                    (closestProtector.memory as RampartProtectorMemory).targetPos = closestRampart.pos.toMemSafe();

                    // If this rampart is near a tower targeted creep then ensure rampart protector attacks that creep as well
                    if (hostileCreep.id === this.turretTarget?.id && closestProtector.pos.isNearTo(hostileCreep)) {
                        closestProtector.memory.targetId = hostileCreep.id;
                    }

                    // Remove protector/rampart from being used again
                    availableProtectors.splice(
                        this.currentRampartProtectors.findIndex((protector) => protector.id === closestProtector.id),
                        1
                    );
                    availableRamparts.splice(
                        availableRamparts.findIndex((rampart) => rampart.id === closestRampart.id),
                        1
                    );
                });
            });

        // TODO: Assign all left over protectors to help already covered areas
    }

    /**
     * Return closest rampart to the hostile Creep. Also works across rooms.
     * @param hostileCreep
     * @param availableRamparts
     * @returns
     */
    private getClosestRampart(hostileCreep: Creep, availableRamparts: StructureRampart[]): StructureRampart {
        let targetPos = hostileCreep.pos;
        if (hostileCreep.pos.roomName !== this.room.name) {
            const targetExit = Game.map.findExit(hostileCreep.room, this.room) as ExitConstant;
            const closestExit = hostileCreep.pos.findClosestByRange(hostileCreep.room.find(targetExit));
            targetPos = this.convertEdgePosition(closestExit, targetExit);
        }

        return availableRamparts.reduce((closestRampart, nextRampart) => {
            const range = closestRampart.pos.getRangeTo(targetPos) - nextRampart.pos.getRangeTo(targetPos);
            if (range < 0) {
                return closestRampart;
            }
            if (range > 0) {
                return nextRampart;
            }

            // We want the creep to be in an odd direction (directly opposite of the enemy creep)
            if (nextRampart.pos.getDirectionTo(targetPos) % 2 === 1) {
                return nextRampart;
            }

            return closestRampart;
        });
    }

    private findRampart(targetPos: RoomPosition, availableRamparts: StructureRampart[]) {
        return availableRamparts.reduce((closestRampart, nextRampart) => {
            const range = closestRampart.pos.getRangeTo(targetPos) - nextRampart.pos.getRangeTo(targetPos);
            if (range < 0) {
                return closestRampart;
            }
            if (range > 0) {
                return nextRampart;
            }

            // We want the creep to be in an odd direction (directly opposite of the enemy creep)
            if (nextRampart.pos.getDirectionTo(targetPos) % 2 === 1) {
                return nextRampart;
            }

            return closestRampart;
        });
    }

    /**
     * Creeps vs Creep combat without ramparts.
     * TODO: Instead of target set targetPos? If target is set currently the rampartProtector does not attack any other creep than the target even if it is out of range.
     * @param target
     * @returns
     */
    private setCreepTarget(myCreeps: CombatCreep[]) {
        const target = this.findCombatTarget();

        myCreeps.forEach((creep) => {
            creep.memory.targetId = target?.id;
        });
    }

    /**
     * Find enemy combat target in creep to creep battle.
     */
    private findCombatTarget(): Creep {
        return undefined;
    }

    /**
     * Convert this exit position to the corresponding one in the next room
     * @param pos
     */
    private convertEdgePosition(pos: RoomPosition, direction: ExitConstant) {
        const { x, y, roomName } = pos;

        let newX = x;
        let newY = y;
        let newRoomName = roomName;

        // Handle different directions
        if (direction === TOP) {
            newY = 49;
            newRoomName = this.getAdjacentRoom(roomName, TOP);
        } else if (direction === LEFT) {
            newX = 49;
            newRoomName = this.getAdjacentRoom(roomName, LEFT);
        } else if (direction === RIGHT) {
            newX = 0;
            newRoomName = this.getAdjacentRoom(roomName, RIGHT);
        } else if (direction === BOTTOM) {
            newY = 0;
            newRoomName = this.getAdjacentRoom(roomName, BOTTOM);
        }

        return new RoomPosition(newX, newY, newRoomName);
    }

    private getAdjacentRoom(roomName: string, direction: ExitConstant) {
        const [x, y] = roomName.match(/\d+/g).map(Number);

        // Calculate adjacent room coordinates based on direction
        if (direction === TOP) {
            return `${x},${y - 1}`;
        } else if (direction === LEFT) {
            return `${x - 1},${y}`;
        } else if (direction === RIGHT) {
            return `${x + 1},${y}`;
        } else if (direction === BOTTOM) {
            return `${x},${y + 1}`;
        }

        return roomName; // Default to the same room name if direction is not recognized
    }
}
