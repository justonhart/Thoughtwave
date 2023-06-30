import { CombatCreep } from '../virtualCreeps/combatCreep';

export class KeeperExterminator extends CombatCreep {
    private attacked: boolean = false;
    memory: KeeperExterminatorMemory;
    protected run() {
        this.manageLifecycle();
        let target = Game.getObjectById(this.memory.targetId);
        if (this.room.name === this.memory.assignment || target) {
            if (!target) {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }
            //if destination is set, then miningPosition construction site needs to be defended
            if (this.memory.destination) {
                let target = this.room.hostileCreeps.find((creep) => this.pos.isNearTo(creep));
                if (target) {
                    this.attack(target);
                }
                delete this.memory.destination;
            } else {
                if (target instanceof Structure) {
                    if (!this.pos.isNearTo(target)) {
                        this.travelTo(target, { range: 1, avoidSourceKeepers: false, efficiency: 1 });
                    }

                    //scan area for keeper
                    let keeper = this.room.hostileCreeps.find(
                        (creep) => creep.owner.username === 'Source Keeper' && target.pos.getRangeTo(creep) <= 5
                    );
                    if (keeper) {
                        this.memory.targetId = keeper.id;
                        this.attackCreep(keeper);
                        this.attacked = true;
                    }
                } else if (target instanceof Creep) {
                    if (this.pos.isNearTo(target)) {
                        this.attackCreep(target as Creep);
                        this.attacked = true;
                        this.move(this.pos.getDirectionTo(target)); // Stay in range if the enemy creep moves
                    } else {
                        const hostileCreepInRange = this.pos.findFirstInRange(this.room.hostileCreeps, 1);
                        if (hostileCreepInRange) {
                            this.attackCreep(hostileCreepInRange);
                        }
                        this.travelTo(target, { range: 1, avoidSourceKeepers: false, efficiency: 1 });
                    }
                }
                // Only heal when necessary or keeper is alive
                if (!this.attacked && (!(target instanceof StructureKeeperLair) || !target.ticksToSpawn || this.damaged())) {
                    this.heal(this);
                }
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findTarget(): Id<Creep> | Id<Structure> | Id<ConstructionSite> {
        const targetRoom = Game.rooms[this.memory.assignment];

        // Attack invaders
        if (targetRoom && Memory.remoteData[this.memory.assignment].threatLevel >= RemoteRoomThreatLevel.ENEMY_ATTTACK_CREEPS) {
            let invaders = targetRoom.hostileCreeps.filter(
                (c) =>
                    (c.body.some((p) => p.type === ATTACK) || c.body.some((p) => p.type === RANGED_ATTACK) || c.body.some((p) => p.type === HEAL)) &&
                    c.owner.username !== 'Source Keeper'
            );
            if (invaders?.length) {
                return this.pos.findClosestByPath(invaders)?.id || this.pos.findClosestByRange(invaders)?.id;
            }
        }

        let sourcesWithConstruction = [];
        const mineralMinerName = Memory.remoteData[this.memory.assignment].mineralMiner;

        // Get next lair based on lowest time until keeper spawns in (if it is undefined it means there is a keeper already at the lair)
        let minedSources = Object.keys(Memory.remoteData[this.memory.assignment].sourceKeeperLairs).filter((key) => {
            if (
                Memory.remoteSourceAssignments[key] &&
                Memory.rooms[Memory.remoteSourceAssignments[key].controllingRoom].remoteSources[key]?.setupStatus ===
                    RemoteSourceSetupStatus.BUILDING_CONTAINER
            ) {
                sourcesWithConstruction.push(key);
            }

            return (
                Memory.remoteSourceAssignments[key] ||
                (mineralMinerName && Game.getObjectById(Memory.creeps[mineralMinerName]?.targetId)?.pos?.toMemSafe() === key)
            );
        });

        // Limit it to sources with construction
        if (sourcesWithConstruction.length) {
            minedSources = minedSources.filter((minedSource) => sourcesWithConstruction.includes(minedSource));
        }

        const lairs = minedSources.map((key) =>
            Game.getObjectById(Memory.remoteData[this.memory.assignment].sourceKeeperLairs[key].id)
        ) as StructureKeeperLair[];
        const nextSpawn = lairs?.reduce((lowestTimer, next) =>
            lowestTimer.ticksToSpawn === undefined ? lowestTimer : lowestTimer?.ticksToSpawn <= next?.ticksToSpawn ? lowestTimer : next
        );
        if (nextSpawn) {
            return nextSpawn.id;
        }
    }

    private manageLifecycle() {
        if (!Memory.remoteData[this.memory.assignment]) return (this.memory.recycle = true);
        if (!this.memory.spawnReplacementAt) {
            this.memory.spawnReplacementAt =
                Game.time +
                this.ticksToLive -
                this.body.length * 3 -
                Object.entries(Memory.remoteSourceAssignments).find(([key, value]) => key.split('.')[2] === this.memory.assignment)[1].roadLength;
        }
        if (Memory.remoteData[this.memory.assignment].keeperExterminator === this.name && Game.time >= this.memory.spawnReplacementAt) {
            Memory.remoteData[this.memory.assignment].keeperExterminator = AssignmentStatus.UNASSIGNED;
        }
    }
}
