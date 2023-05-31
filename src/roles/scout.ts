import { Pathing } from '../modules/pathing';
import { WaveCreep } from '../virtualCreeps/waveCreep';

interface ScoutingOperation extends Operation {
    pathRooms: string[];
    routeConfirmed: boolean;
}

export class Scout extends WaveCreep {
    memory: ScoutMemory;
    operation: ScoutingOperation;

    protected run() {
        if (this.operation) {
            this.runOperationScouting();
        } else {
            this.runGeneralScouting();
        }
    }

    private runOperationScouting() {
        if (this.room.name !== this.operation.targetRoom) {
            if (this.operation.pathRooms) {
                this.travelToRoom(this.operation.targetRoom, { allowedRooms: this.operation.pathRooms });
            } else {
                this.travelToRoom(this.operation.targetRoom);
            }
        } else {
            this.operation.routeConfirmed = true;
        }
    }

    private runGeneralScouting() {
        if (this.memory.pathTree === undefined) {
            if (this.memory.debug) {
                console.log('creating scout memory');
            }
            this.initScoutMemory();
        }

        if (this.room.name !== this.memory.roomLastTick) {
            if (this.memory.returnToLastRoom) {
                if (this.memory.debug) {
                    console.log('returned to last room, pruning last path node. depth: ' + (this.getDepth() - 1));
                }
                this.memory.pathTree = this.memory.pathTree.substring(0, this.memory.pathTree.length - 1);
                delete this.memory.returnToLastRoom;
                delete this.memory.nextRoom;
            } else {
                this.updatePath();
            }
        }

        if (Memory.roomData[this.room.name].hostile || this.memory.pathTree.length >= this.memory.maxDepth) {
            if (this.memory.debug) {
                console.log(`Returning to last room: hostile:${Memory.roomData[this.room.name].hostile} depth:${this.memory.pathTree.length}`);
            }
            this.memory.returnToLastRoom = true;
        }

        if (!this.memory.returnToLastRoom && !this.memory.nextRoom) {
            const nextRoom = this.getNextRoom();
            if (nextRoom) {
                if (this.memory.debug) {
                    console.log('next room destination acquired: ' + nextRoom);
                }
                this.memory.nextRoom = nextRoom;
            } else {
                if (this.memory.pathTree.length) {
                    if (this.memory.debug) {
                        console.log('no more rooms, returning to last node');
                    }
                    this.memory.returnToLastRoom = true;
                } else {
                    //scouting completed
                    if (this.memory.debug) {
                        console.log('scouting completed');
                    }
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
                if (this.memory.debug) {
                    console.log(`Setting nextRoom to previous room: ${this.memory.nextRoom}`);
                }
            }
        }

        if (this.memory.nextRoom) {
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
        if (this.memory.debug) {
            console.log(this.room.name + ' reached, updating path - depth: ' + this.getDepth());
        }
        this.memory.roomsVisited.push({ depth: this.getDepth(), roomName: this.room.name });
        delete this.memory.nextRoom;
    }
}
