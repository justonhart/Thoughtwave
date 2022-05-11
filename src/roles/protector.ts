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
            const result = this.getActiveBodyparts(ATTACK) ? this.attack(target) : this.rangedAttack(target);

            switch (result) {
                case ERR_NOT_IN_RANGE:
                    this.travelTo(target, { ignoreCreeps: false, reusePath: 0 });
                    break;
                case OK:
                    break;
                default: // aquire new target
                    this.memory.targetId = this.findTarget();
                    break;
            }
        } else {
            delete this.memory.targetId;
        }
    }
}
