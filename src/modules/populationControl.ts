export default function populationControl(spawn: StructureSpawn){  
    let roomCreeps = Object.values(Game.creeps).filter(creep => creep.memory.room === spawn.room.name);

    if(roomCreeps.filter(creep => creep.memory.role === Role.WORKER).length < 2){
        spawn.spawnCreep([WORK, CARRY, MOVE], `Creep ${Game.time}`, {memory: {role: Role.WORKER, room: spawn.room.name}});
    }
}