import { Pathing } from '../modules/pathing';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Scout extends WaveCreep {
    memory: ScoutMemory;
    protected run() {
        if (this.memory.pathTree === undefined) {
            this.initScoutMemory();
        }

        if (this.room.name !== this.memory.roomLastTick) {
            if (this.memory.returnToLastRoom) {
                this.memory.pathTree = this.memory.pathTree.substring(0, this.memory.pathTree.length - 1);
                delete this.memory.returnToLastRoom;
                delete this.memory.nextRoom;
            } else {
                this.updatePath();
            }
        }

        if (Memory.roomData[this.room.name].hostile || this.memory.pathTree.length >= this.memory.maxDepth) {
            this.memory.returnToLastRoom = true;
        }

        if (!this.memory.returnToLastRoom && !this.memory.nextRoom) {
            const nextRoom = this.getNextRoom();
            if (nextRoom) {
                this.memory.nextRoom = nextRoom;
            } else {
                if (this.memory.pathTree.length) {
                    this.memory.returnToLastRoom = true;
                } else {
                    //scouting completed
                    this.memory.recycle = true;
                    this.recycleCreep();
                    return;
                }
            }
        }

        if (this.memory.returnToLastRoom && !this.memory.nextRoom) {
            if (this.memory.pathTree.length) {
                this.memory.nextRoom = Game.map.describeExits(this.room.name)[
                    Pathing.inverseDirection(Number.parseInt(this.memory.pathTree.slice(-1)) as DirectionConstant)
                ];
            }
        } else if (this.memory.nextRoom) {
            this.travelToRoom(this.memory.nextRoom, { maxRooms: 1 });
        }

        this.memory.roomLastTick = this.room.name;
    }

    private initScoutMemory() {
        this.memory.pathTree = '';
        this.memory.roomsVisited = [{ depth: this.getDepth(), roomName: this.room.name }];
        if (!this.memory.maxDepth) {
            this.memory.maxDepth = 3;
        }
        this.memory.roomLastTick = this.room.name;
    }

    private getNextRoom(): string {
        const adjacentRooms = Object.values(Game.map.describeExits(this.room.name));
        return adjacentRooms.find(
            (room) =>
                !Memory.roomData[room]?.hostile &&
                !this.memory.roomsVisited.some((visit) => visit.roomName === room && visit.depth <= this.getDepth() + 1)
        );
    }

    private getDepth(): number {
        return this.memory.pathTree.length;
    }

    private updatePath(): void {
        this.memory.pathTree += Game.map.findExit(this.memory.roomLastTick, this.room.name).toString();
        this.memory.roomsVisited.push({ depth: this.getDepth(), roomName: this.room.name });
        delete this.memory.nextRoom;
    }
}
