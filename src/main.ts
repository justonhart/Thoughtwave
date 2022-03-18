import populationControl from "./modules/populationControl";

module.exports.loop = function () {

  Object.values(Game.spawns).forEach(s => {
    if(!s.spawning){
      populationControl(s);
    }
  });

};
