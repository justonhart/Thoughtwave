export default function populationControl(spawn: StructureSpawn){
    
    let roomCreeps = Object.values(Game.creeps).filter(c => c.memory.room === spawn.room.name);

    if(roomCreeps.filter(c => c.memory.role === Role.HARVESTER).length < 2){
        spawn.spawnCreep([WORK, CARRY, MOVE], `Creep ${Game.time}`, {memory: {role: Role.HARVESTER, room: spawn.room.name}});
    }
}