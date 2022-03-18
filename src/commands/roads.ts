export function constructRoadsFromSpawnToSources(room: Room) {
  // Roads will only be build once --> If implemented into game loop then uncomment memory check
  //if (!room.memory.roadsConstructed) {
  let sources = room.find(FIND_SOURCES).map((source) => source.pos);
  constructRoads(room, sources);
  //  room.memory.roadsConstructed = true;
  //}
}

export function constructRoads(room: Room, targets: RoomPosition[]) {
  // Find spawn
  var spawn = room.find(FIND_STRUCTURES, {
    filter: (structure: Structure) => {
      return structure.structureType == STRUCTURE_SPAWN;
    },
  })[0];

  // Create Roads
  targets.forEach((target) => {
    const roadCoords = spawn.pos.findPathTo(target, { ignoreCreeps: true, ignoreRoads: true, swampCost: 1 }); // Closest path from spawn to target
    for (let i = 1; i < roadCoords.length - 2; i++) {
      // Ignore the first and last two construction sites
      room.createConstructionSite(roadCoords[i].x, roadCoords[i].y, STRUCTURE_ROAD);
    }
  });
}
