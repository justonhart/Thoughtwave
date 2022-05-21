import { PopulationManagement } from '../modules/populationManagement';
import { WaveCreep } from '../virtualCreeps/waveCreep';

export class Claimer extends WaveCreep {
    public run() {
        // let claimOpExists = Memory.empire.colonizationOperations.some((op) => op.destination === this.memory.destination);
        // if (!claimOpExists &&) {
        //     console.log(`No colonize operation found for ${this.name}. Terminating.`);
        //     this.suicide();
        // }

        if (Game.flags.intershardColonize && !this.memory.destination) {
            this.memory.destination = Game.flags.intershardColonize.pos.roomName;
        }

        if (Game.flags.colonizePortal) {
            if (this.travelToRoom(Game.flags.colonizePortal.pos.roomName) === IN_ROOM) {
                if (
                    this.pos.isNearTo(Game.flags.colonizePortal) &&
                    Game.flags.colonizePortal.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_PORTAL)
                ) {
                    //@ts-expect-error
                    let portal: StructurePortal = Game.flags.colonizePortal.pos
                        .lookFor(LOOK_STRUCTURES)
                        .find((s) => s.structureType === STRUCTURE_PORTAL);

                    //@ts-expect-error
                    if (portal.destination.shard) {
                        this.enterInterShardPortal(portal);
                    } else {
                        this.moveTo(Game.flags.colonizePortal);
                    }
                } else {
                    this.travelTo(Game.flags.colonizePortal);
                }
            }
        } else {
            // Go to the target room
            if (this.travelToRoom(this.memory.destination) === IN_ROOM) {
                if (this.room.controller.my) {
                    console.log(`${this.room.name} has been claimed!`);
                    let opIndex = Memory.empire.operations.findIndex((op) => op.type === OperationType.COLONIZE && op.targetRoom === this.room.name);
                    if (opIndex > -1) {
                        Memory.empire.operations[opIndex].stage = this.room.canSpawn() ? OperationStage.COMPLETE : OperationStage.BUILD;
                    }

                    let preexistingStructures = this.room.find(FIND_STRUCTURES).filter(
                        //@ts-ignore
                        (structure) => ![STRUCTURE_WALL, STRUCTURE_STORAGE, STRUCTURE_TERMINAL].includes(structure.structureType) && !structure.my
                    );

                    preexistingStructures.forEach((struct) => struct.destroy());

                    this.suicide();
                } else {
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

                    // Check if still claimed by enemy
                    const action = this.room.controller?.reservation?.username
                        ? this.attackController(this.room.controller)
                        : this.claimController(this.room.controller);
                    // Claim Controller in target room
                    switch (action) {
                        case ERR_NOT_IN_RANGE:
                            this.travelTo(this.room.controller, { range: 1, swampCost: 1 });
                            break;
                        case ERR_INVALID_TARGET:
                        case OK:
                            break;
                    }
                }
            }
        }
    }
}
