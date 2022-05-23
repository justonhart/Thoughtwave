import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Protector extends WaveCreep {
    public run() {
        if (this.hits < this.hitsMax && this.getActiveBodyparts(HEAL)) {
            this.heal(this);
        }
        if (this.memory.combat.healing && this.pos.roomName !== this.memory.assignment) {
            return; // Creep retreated to previous room to heal
        }
        if (this.travelToRoom(this.memory.assignment, { avoidHostiles: false }) === IN_ROOM) {
            if (!this.memory.targetId) {
                this.memory.targetId = this.findTarget();
            }
            if (!this.memory.targetId) {
                return;
            }
            this.attackCreep();
        }
        // Healing logic
        if (!this.memory.combat.healing && this.hits < this.hitsMax / 3 && this.getActiveBodyparts(HEAL)) {
            this.memory.combat.healing = true;
        } else if (this.memory.combat.healing && this.hits / this.hitsMax > 0.8) {
            this.memory.combat.healing = false;
        }
    }

    private findTarget() {
        const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
        if (hostileCreeps.length) {
            const healers = hostileCreeps.filter((creep) => creep.getActiveBodyparts(HEAL) > 0);

            return healers.length ? this.pos.findClosestByRange(healers).id : this.pos.findClosestByRange(hostileCreeps).id;
        }
        const hostileRamparts = this.room.find(FIND_HOSTILE_STRUCTURES, { filter: (struct) => struct.structureType == STRUCTURE_RAMPART });
        if (hostileRamparts.length) {
            return hostileRamparts[0].id;
        }

        const hostileStructures = this.room
            .find(FIND_HOSTILE_STRUCTURES)
            .filter((struct) => !(struct.structureType === STRUCTURE_STORAGE && struct.store.getUsedCapacity()));
        if (hostileStructures.length) {
            return hostileStructures[0].id;
        }
    }

    private attackCreep() {
        const target = Game.getObjectById(this.memory.targetId);
        if (target instanceof Creep || target instanceof Structure) {
            let result: CreepActionReturnCode;
            if (this.getActiveBodyparts(ATTACK)) {
                this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: 1 });
                result = this.attack(target);
            } else {
                let range = 3;
                let exitCost = 10;
                let shouldFlee = true;
                if (this.pos.getRangeTo(target) > range) {
                    shouldFlee = false;
                }
                if (this.memory.combat.healing) {
                    range = 4;
                    exitCost = 1;
                }
                this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: range, flee: shouldFlee, exitCost: exitCost });
                result = this.rangedAttack(target);
            }
            if (!this.memory.combat.healing && result !== OK && result !== ERR_NOT_IN_RANGE) {
                delete this.memory.targetId;
            }
        } else {
            delete this.memory.targetId;
        }
    }
}
