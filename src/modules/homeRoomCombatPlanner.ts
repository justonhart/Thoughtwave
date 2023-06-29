import { CombatIntel } from './combatIntel';
import { CombatPlanner } from './combatPlanner';
import { PopulationManagement } from './populationManagement';

export class HomeRoomCombatPlanner extends CombatPlanner {
    private detectedEarlyThreat: boolean;
    private numRampartProtectors: number;
    private currentRampartProtectors: Creep[];
    private turretTarget: Creep;

    public constructor(room: Room) {
        try {
            super(room);
            this.numRampartProtectors = PopulationManagement.currentNumRampartProtectors(room.name);
            this.currentRampartProtectors = room.myCreeps.filter((creep) => creep.memory.role === Role.RAMPART_PROTECTOR);
            this.detectedEarlyThreat = this.hasEarlyDetectionThreat();
        } catch (e) {
            console.log(`Error caught for CombatPlanner in ${room.name}: \n${e}`);
        }
    }

    public run() {
        // No Defense needed if safeMode is on or no more enemy creeps are in or around the room
        if (
            this.room.controller.safeMode > 150 ||
            (this.room.memory.threatLevel <= HomeRoomThreatLevel.ENEMY_NON_COMBAT_CREEPS && !this.detectedEarlyThreat)
        ) {
            this.runTowersForHeal();
            this.recycleRampartProtectors();
            return;
        }

        // Threat detected around the homeroom
        if (this.detectedEarlyThreat) {
            this.handleEarlyThreatDetection();
            // Create vision in surrounding rooms
            this.createSentries();
        }

        // Run Towers
        const needActiveDefense = this.runTowers();

        // Spawn in Rampart Protectors and send scouts to keep vision of surrounding rooms
        if (needActiveDefense) {
            this.spawnActiveDefense();
            // Create vision in surrounding rooms
            this.createSentries();
        }

        // Set defense positions (should run even when activeDefense is no longer needed)
        this.runDefensePositions();

        // If turrets are attacking a creep then ensure all ramparts in range also attack the same creep
        if (this.turretTarget) {
            this.currentRampartProtectors
                .filter((protector) => protector.pos.isNearTo(this.turretTarget))
                .forEach((protectInRange) => (protectInRange.memory.targetId = this.turretTarget.id));
        }
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
        const parts = this.room.controller.level < 4 ? [RANGED_ATTACK, HEAL, MOVE] : [ATTACK, MOVE];
        const boostParts = [BoostType.ATTACK, BoostType.MOVE];
        const body = PopulationManagement.createDynamicCreepBody(this.room, parts, 9999, 1, { boosts: boostParts });
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
                // If there is a creep that cannot be killed then spawn a protector
                if (!predictedDamage || predictedDamage <= hostileCreepInfo.totalHeal) {
                    needActiveDefense = true;
                }
                // Attack the creep that can be killed and takes the most damage
                if (predictedDamage > hostileCreepInfo.totalHeal && (!targetCreepInfo.creep || targetCreepInfo.predictedDamage < predictedDamage)) {
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

    /**
     * Get all enemy combat units but also enemy dismantlers.
     * @param targetRoom
     * @returns
     */
    protected getAggressiveHostileCreeps(targetRoom?: Room): Creep[] {
        if (!targetRoom) {
            targetRoom = this.room;
        }
        return targetRoom.hostileCreeps.filter(
            (hostileCreep) =>
                hostileCreep.hasActiveBodyparts(WORK) || hostileCreep.hasActiveBodyparts(RANGED_ATTACK) || hostileCreep.hasActiveBodyparts(ATTACK)
        );
    }

    /**
     * Send sentries to adjacent rooms to keep vision
     */
    private createSentries(): void {
        this.exitRooms.forEach((exitRoom) => {
            if (
                !this.room.myCreepsByMemory.some(
                    (creep) => creep.memory.role === Role.SENTRY && creep.memory.assignment === exitRoom && creep.ticksToLive > 50
                ) &&
                !Memory.spawnAssignments.some(
                    (assignment) => assignment.spawnOpts.memory.role === Role.SENTRY && assignment.spawnOpts.memory.assignment === exitRoom
                )
            ) {
                Memory.spawnAssignments.push({
                    designee: this.room.name,
                    spawnOpts: {
                        memory: {
                            role: Role.SENTRY,
                            assignment: exitRoom,
                            room: this.room.name,
                        },
                    },
                    body: [MOVE],
                });
            }
        });
    }

    /**
     * Set Rampart Protectors pathing target.
     * Prioritization:
     *  1. keeping aggressive creeps from the ramparts
     *  2. attacking healers that are near ramparts
     *  3. having a protector close to aggressive units from adjacent rooms (so if they enter a protector is already there)
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
            this.getAggressiveHostileCreeps().forEach((hostileCreep) => this.setProtectorPos(availableProtectors, availableRamparts, hostileCreep));

            // Get any creep that is next to a rampart ()
            this.room.hostileCreeps
                .filter((hostileCreep) => hostileCreep.hasActiveBodyparts(HEAL))
                .forEach((hostileHealerCreep) => this.setProtectorPos(availableProtectors, availableRamparts, hostileHealerCreep));

            // Check Exit Rooms
            this.exitRooms
                .filter((exitRoom) => Game.rooms[exitRoom])
                .forEach((visibleExitRoom) => {
                    const room = Game.rooms[visibleExitRoom];
                    this.getAggressiveHostileCreeps(room).forEach((hostileCreep) =>
                        this.setProtectorPos(availableProtectors, availableRamparts, hostileCreep)
                    );
                });

            // TODO: Assign all left over protectors to help already covered areas
        }
    }

    private setProtectorPos(availableProtectors: Creep[], availableRamparts: StructureRampart[], hostileCreep: Creep) {
        if (!availableProtectors.length || !availableRamparts.length) {
            return;
        }
        const closestRampart = this.getClosestRampart(hostileCreep, availableRamparts);
        const closestProtector = closestRampart.pos.findClosestByRange(availableProtectors);
        (closestProtector.memory as RampartProtectorMemory).targetPos = closestRampart.pos.toMemSafe();

        // Remove protector/rampart from being used again
        availableProtectors.splice(
            this.currentRampartProtectors.findIndex((protector) => protector.id === closestProtector.id),
            1
        );
        availableRamparts.splice(
            availableRamparts.findIndex((rampart) => rampart.id === closestRampart.id),
            1
        );
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
}
