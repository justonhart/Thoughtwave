import populationControl from "./modules/populationControl";

module.exports.loop = function () {

  Object.values(Game.spawns).forEach(spawn => {
    if(!spawn.spawning){
      populationControl(spawn);
    }
  });

};
