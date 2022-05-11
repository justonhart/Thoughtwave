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
                    let opIndex = Memory.empire.colonizationOperations.findIndex((op) => op.destination === this.room.name);
                    if (opIndex > -1) {
                        Memory.empire.colonizationOperations[opIndex].stage = this.room.canSpawn() ? ColonizeStage.COMPLETE : ColonizeStage.BUILD;
                    }

                    let preexistingStructures = this.room
                        .find(FIND_STRUCTURES)
                        //@ts-ignore
                        .filter(
                            (structure) => ![STRUCTURE_WALL, STRUCTURE_STORAGE, STRUCTURE_TERMINAL].includes(structure.structureType) && !structure.my
                        );

                    preexistingStructures.forEach((struct) => struct.destroy());

                    this.suicide();
                } else {
                    // Claim Controller in target room
                    switch (this.claimController(this.room.controller)) {
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
