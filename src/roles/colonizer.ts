import { getSpawnPos } from '../modules/roomDesign';
import { WorkerCreep } from '../virtualCreeps/workerCreep';

export class Colonizer extends WorkerCreep {
    protected performDuties() {
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
                let target = Game.getObjectById(this.memory.targetId);

                if (!target) {
                    this.memory.targetId = this.findTarget();
                    target = Game.getObjectById(this.memory.targetId);
                }
                if (target instanceof ConstructionSite) {
                    this.runBuildJob(target);
                } else {
                    if (this.room.mySpawns.length > 0) {
                        let opIndex = Memory.operations.findIndex((op) => op.type === OperationType.COLONIZE && op.targetRoom === this.room.name);
                        if (Memory.operations[opIndex]) {
                            Memory.operations[opIndex].stage = OperationStage.COMPLETE;
                            console.log(`${this.room.name} spawn has been build!`);
                        }
                        this.convertToWorker();
                    } else {
                        this.prepareRoom();
                    }
                }
            }
        }
    }

    private findTarget(): Id<ConstructionSite> {
        let sites = this.room.myConstructionSites.filter((site) => site.structureType === STRUCTURE_SPAWN);

        return sites.pop()?.id;
    }

    private prepareRoom() {
        let spawnPos = getSpawnPos(this.room);
        this.room.createConstructionSite(spawnPos.x, spawnPos.y, STRUCTURE_SPAWN);
    }

    private convertToWorker() {
        this.memory.role = Role.WORKER; // Turn into worker
        this.memory.room = this.memory.destination; // Change to new room
    }
}
