import { posFromMem } from '../modules/memoryManagement';
import { PopulationManagement } from '../modules/populationManagement';
import { posInsideBunker } from '../modules/roomDesign';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    protected run() {
        if (!this.memory.assignment) {
            if (this.travelToRoom(this.memory.destination, { avoidHostileRooms: true, avoidHostiles: true }) === IN_ROOM) {
                this.memory.assignment = this.room.controller.pos.toMemSafe();
            }
        } else {
            let targetPos = posFromMem(this.memory.assignment);

            if (this.room.name === this.memory.destination) {
                // If there is an invader claimer in the room send a cleanup creep
                const invaderCore = this.room.find(FIND_HOSTILE_STRUCTURES, {
                    filter: (struct) => struct.structureType === STRUCTURE_INVADER_CORE,
                });

                if (
                    invaderCore.length &&
                    !Object.values(Game.creeps).filter(
                        (creep) =>
                            creep.memory.role === Role.PROTECTOR &&
                            (creep.pos.roomName === this.room.name || creep.memory.assignment === this.room.name)
                    ).length &&
                    !Memory.empire.spawnAssignments.filter(
                        (creep) => creep.memoryOptions.role === Role.PROTECTOR && creep.designee === this.homeroom.name
                    ).length &&
                    this.homeroom.canSpawn()
                ) {
                    Memory.empire.spawnAssignments.push({
                        designee: this.homeroom.name,
                        body: PopulationManagement.createPartsArray([ATTACK, MOVE], this.homeroom.energyCapacityAvailable, 8),
                        memoryOptions: {
                            role: Role.PROTECTOR,
                            room: this.homeroom.name,
                            assignment: this.room.name,
                            currentTaskPriority: Priority.MEDIUM,
                        },
                    });
                }
            }

            if (!this.pos.isNearTo(targetPos)) {
                this.travelTo(targetPos, { avoidHostileRooms: true, avoidHostiles: true, range: 1 });
            } else {
                if (Game.rooms[this.memory.destination]?.controller?.my) {
                    console.log(`${this.room.name} has been claimed!`);
                    let opIndex = Memory.empire.operations.findIndex((op) => op.type === OperationType.COLONIZE && op.targetRoom === this.room.name);
                    if (opIndex > -1) {
                        Memory.empire.operations[opIndex].stage = this.room.canSpawn() ? OperationStage.COMPLETE : OperationStage.BUILD;
                    }

                    let preexistingStructures = this.room.find(FIND_STRUCTURES).filter(
                        (structure) =>
                            //@ts-ignore
                            (![STRUCTURE_STORAGE, STRUCTURE_TERMINAL].includes(structure.structureType) || posInsideBunker(structure.pos)) &&
                            //@ts-ignore
                            !structure.my
                    );

                    preexistingStructures.forEach((struct) => struct.destroy());

                    this.suicide();
                } else {
                    let result = this.claimController(this.room.controller);
                    if (result === ERR_INVALID_TARGET) {
                        this.attackController(this.room.controller);
                    }
                }
            }
        }
    }
}
