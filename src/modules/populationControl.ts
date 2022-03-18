export default function populationControl(spawn: StructureSpawn){
    
    let roomCreeps = Object.values(Game.creeps).filter(creep => creep.memory.room === spawn.room.name);

    if(roomCreeps.filter(creep => creep.memory.role === Role.HARVESTER).length < 2){
        spawn.spawnCreep([WORK, CARRY, MOVE], `Creep ${Game.time}`, {memory: {role: Role.HARVESTER, room: spawn.room.name}});
    }
}