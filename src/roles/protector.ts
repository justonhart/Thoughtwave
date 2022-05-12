import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Protector extends WaveCreep {
    public run() {
        if (this.memory.assignment && this.travelToRoom(this.memory.assignment, { avoidHostiles: false }) == IN_ROOM) {
            if (!this.memory.targetId) {
                this.memory.targetId = this.findTarget();
            }
            if (!this.memory.targetId) {
                delete this.memory.assignment;
            }
            this.attackCreep();
        }
    }

    private findTarget() {
        const hostileCreeps = this.room.find(FIND_HOSTILE_CREEPS);
        if (hostileCreeps.length) {
            const healers = hostileCreeps.filter((creep) => creep.getActiveBodyparts(HEAL) > 0);

            return healers.length ? this.pos.findClosestByRange(healers).id : this.pos.findClosestByRange(hostileCreeps).id;
        }
        const hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES);
        if (hostileStructures.length) {
            return hostileStructures[0].id;
        }
    }

    private attackCreep() {
        const target = Game.getObjectById(this.memory.targetId);
        if (target instanceof Creep || target instanceof Structure) {
            let result: CreepActionReturnCode;
            if (this.getActiveBodyparts(ATTACK)) {
                this.travelTo(target, { ignoreCreeps: false, reusePath: 0 });
                result = this.attack(target);
            } else {
                let shouldFlee = true;
                if (this.pos.getRangeTo(target) > 3) {
                    shouldFlee = false;
                }
                this.travelTo(target, { ignoreCreeps: false, reusePath: 0, range: 3, flee: shouldFlee, exitCost: 10 }); // TODO: avoidExits when fleeing (later it can be changed depending on HEAL and current health to recover)
                result = this.rangedAttack(target);
            }
            if (result !== OK && result !== ERR_NOT_IN_RANGE) {
                delete this.memory.targetId;
            }
        } else {
            delete this.memory.targetId;
        }
    }
}
