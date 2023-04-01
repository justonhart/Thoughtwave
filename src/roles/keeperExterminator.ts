import { CombatCreep } from '../virtualCreeps/combatCreep';

export class KeeperExterminator extends CombatCreep {
    private attacked: boolean = false;
    protected run() {
        this.manageLifecycle();
        let target = Game.getObjectById(this.memory.targetId);
        if (this.room.name === this.memory.assignment || target) {
            if (!target) {
                this.memory.targetId = this.findTarget();
                target = Game.getObjectById(this.memory.targetId);
            }
            //if destination is set, then miningPosition construction site needs defended
            if (this.memory.destination) {
                let target = this.pos.findInRange(FIND_HOSTILE_CREEPS, 1)?.pop();
                if (target) {
                    this.attack(target);
                }
                delete this.memory.destination;
            } else {
                if (target instanceof Structure) {
                    if (!this.pos.isNearTo(target)) {
                        this.travelTo(target, { range: 1, avoidSourceKeepers: false });
                    }
                    
                    //scan area for keeper
                    let keeper = target.pos.findInRange(FIND_HOSTILE_CREEPS, 5, { filter: (c) => c.owner.username === 'Source Keeper' }).shift();
                    if (keeper) {
                        this.memory.targetId = keeper.id;
                    }
                } else if (target instanceof Creep) {
                    if (this.pos.isNearTo(target)) {
                        this.attackCreep(target as Creep);
                        this.attacked = true;
                        this.move(this.pos.getDirectionTo(target)); // Stay in range if the enemy creep moves
                    } else {
                        this.travelTo(target, { range: 1, avoidSourceKeepers: false });
                    }
                }
                if (!this.attacked) {
                    this.heal(this);
                }
            }
        } else {
            this.travelToRoom(this.memory.assignment);
        }
    }

    private findTarget(): Id<Creep> | Id<Structure> | Id<ConstructionSite> {
        let sourcesMined = Object.keys(Memory.remoteSourceAssignments).filter((key) => key.split('.')[2] === this.memory.assignment);

        let invaders = Game.rooms[this.memory.assignment]?.find(FIND_HOSTILE_CREEPS, {
            filter: (c) =>
                (c.body.some(p => p.type === ATTACK) || c.body.some(p => p.type === RANGED_ATTACK) || c.body.some(p => p.type === HEAL) )&& c.owner.username !== 'Source Keeper',
        });
        if (invaders?.length) {
            return this.pos.findClosestByPath(invaders)?.id || this.pos.findClosestByRange(invaders)?.id;
        }

        let threats = [];
        sourcesMined.forEach((source) => {
            let sourceMemory = Memory.rooms[Memory.remoteSourceAssignments[source].controllingRoom].remoteSources[source];
            if (
                (sourceMemory.setupStatus === RemoteSourceSetupStatus.BUILDING_CONTAINER && sourceMemory.miner === AssignmentStatus.UNASSIGNED) ||
                Game.creeps[sourceMemory.miner].pos.inRangeTo(sourceMemory.miningPos.toRoomPos(), 1)
            ) {
                this.memory.destination = sourceMemory.miningPos;
                return;
            }

            let threat = source.toRoomPos().findInRange(FIND_HOSTILE_CREEPS, 5)?.pop();
            if (threat) {
                threats.push(threat);
            }
        });

        if (threats.length) {
            return this.pos.findClosestByPath(threats)?.id;
        }

        let lairs = Object.keys(Memory.remoteData[this.memory.assignment].sourceKeeperLairs)
            .filter((key) => Memory.remoteSourceAssignments[key])
            .map((key) => Game.getObjectById(Memory.remoteData[this.memory.assignment].sourceKeeperLairs[key])) as StructureKeeperLair[];
        let nextSpawn = lairs?.reduce((lowestTimer, next) => (lowestTimer?.ticksToSpawn <= next?.ticksToSpawn ? lowestTimer : next));
        if (nextSpawn) {
            return nextSpawn.id;
        }
    }

    private manageLifecycle(): void{
        if(!this.memory.spawnReplacementAt){
            this.memory.spawnReplacementAt = Game.time + this.ticksToLive - this.body.length * 3 - (Object.entries(Memory.remoteSourceAssignments).find(([key, value]) => key.split('.')[2] === this.memory.assignment)[1].roadLength);
        }
        if(Memory.remoteData[this.memory.assignment].keeperExterminator === this.name && Game.time >= this.memory.spawnReplacementAt){
            Memory.remoteData[this.memory.assignment].keeperExterminator = AssignmentStatus.UNASSIGNED;
        }
    }
}
