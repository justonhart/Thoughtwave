# Thoughtwave

A next-generation AI for Screeps

## NPM packages

-   Grunt + [grunt-screeps](https://github.com/screeps/grunt-screeps) - for deployment
-   dotenv - for isolating login values from GH
-   typescript
-   husky + prettier - uniform formatting

## Installation

-   Install Grunt: npm install -g grunt-cli
-   Input Data from Screeps Account into "example.env" and rename it to ".env"
-   Run in Project: npm install
-   Upload to Screeps: grunt screeps

## Source Tree Layout

-   Interfaces: All Typescript interfaces/types/enums (these will not be pushed up to the screeps server)
-   Protypes: Any Screeps Prototype functions (to import these add the necessary require Step to the "requirePrototypes.ts" File)
-   Modules: General logic modules such as spawning/room/empire
-   Commands: Methods that are not used in the game loop. Only used directly in the console. Example: "require('roads').clearRoadConstructions(Game.spawns.Spawn1.room)"

## Roles

These are the different roles for our creeps:

| Role        | Purpose                                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UPGRADER    | Exclusively upgrades the room controller.                                                                                                                                                         |
| MINER       | Stands at sources and harvests energy at 100% efficiency.                                                                                                                                         |
| DISTRIBUTOR | Distributes energy from storage to structures in need. Acts as a transporter if no distribution work needs done.                                                                                  |
| TRANSPORTER | Gathers resources from containers or tombstones and moves them to storage.                                                                                                                        |
| MINER       | Stands at sources and harvests energy at 100% efficiency.                                                                                                                                         |
| CLAIMER     | Place a flag anywhere in the room you want to claim, then a Creep will automatically spawn and claim the controller in that if possible.                                                          |
| COLONIZER   | Goes to the newly claimed room and builds the spawner. There should always be 2 colonizers until the spawner has been build. Then the flag will get removed and normal room operation will start. |

## Priority Queue

To override default creep behavior you can use the Priority Queue implemented in the WaveCreep class. To pass an action to the priority queue the following code snippet can be used as a template:

```
creep.addTaskToPriorityQueue(Priority.LOW, () => {
        creep.travelTo(Game.spawns.Spawn1);
});
```
