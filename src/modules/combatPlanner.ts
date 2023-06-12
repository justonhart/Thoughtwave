import { CombatIntel } from './combatIntel';
import { PopulationManagement } from './populationManagement';

export class CombatPlanner {
    private detectedEarlyThreat: boolean;
    private numRampartProtectors: number;
    private room: Room;

    public constructor(room: Room) {
        try {
            this.room = room;
            switch (room.memory.roomType) {
                case RoomType.HOMEROOM:
                    this.numRampartProtectors = PopulationManagement.currentNumRampartProtectors(room.name);
                    this.detectedEarlyThreat = this.hasEarlyDetectionThreat(room.name);
                    this.defendHomeRoom();
                    break;
            }
            if (room.memory.roomType === RoomType.HOMEROOM) {
                this.numRampartProtectors = PopulationManagement.currentNumRampartProtectors(room.name);
                this.detectedEarlyThreat = this.hasEarlyDetectionThreat(room.name);
                this.defendHomeRoom();
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
        let numNeededProtectors =
            this.room.hostileCreeps.filter(
                (hostileCreep) =>
                    hostileCreep.getActiveBodyparts(WORK) || hostileCreep.getActiveBodyparts(RANGED_ATTACK) || hostileCreep.getActiveBodyparts(ATTACK)
            ).length - this.numRampartProtectors;
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
        this.room.myCreepsByMemory.filter((creep) => creep.memory.role === Role.RAMPART_PROTECTOR).forEach((creep) => (creep.memory.recycle = true));
        Memory.spawnAssignments = Memory.spawnAssignments.filter(
            (creep) => creep.spawnOpts.memory.role !== Role.RAMPART_PROTECTOR || creep.spawnOpts.memory.room !== this.room.name
        );
    }

    private hasEarlyDetectionThreat(roomName: string) {
        return Object.values(Game.map.describeExits(roomName)).some((exitRoomName) => Memory.roomData[exitRoomName]?.threatDetected);
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
    private runDefensePositions(): void {}
}
