import { WaveCreep } from '../virtualCreeps/waveCreep';

export class IntershardTraveler extends WaveCreep {
    protected run() {
        if (this.room.name !== this.memory.destination) {
            this.travelToRoom(this.memory.destination);
        } else {
            if (this.room.controller?.my) {
                switch (this.memory.nextRole) {
                    case Role.MINER:
                        this.initMinerMemory();
                        break;
                    case Role.WORKER:
                        this.initWorkerMemory();
                        break;
                }
            }
        }
    }

    private initWorkerMemory() {
        this.memory.room = this.memory.destination;
        this.memory.role = this.memory.nextRole;
        delete this.memory.destination;
        delete this.memory.nextRole;
    }

    private initMinerMemory() {
        this.memory.room = this.memory.destination;

        let assignment = Object.keys(this.room.memory.miningAssignments).find(
            (k) => this.room.memory.miningAssignments[k] === AssignmentStatus.UNASSIGNED
        );
        if (assignment) {
            this.room.memory.miningAssignments[assignment] = AssignmentStatus.ASSIGNED;
            this.memory.assignment = assignment;
        }

        this.memory.role = this.memory.nextRole;
        delete this.memory.destination;
        delete this.memory.nextRole;
    }
}
