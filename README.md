# Thoughtwave

A next-generation AI for Screeps

## NPM packages

- Grunt + [grunt-screeps](https://github.com/screeps/grunt-screeps) - for deployment
- dotenv - for isolating login values from GH
- typescript
- husky + prettier - uniform formatting

## Installation

- Install Grunt: npm install -g grunt-cli
- Input Data from Screeps Account into "example.env" and rename it to ".env"
- Run in Project: npm install
- Upload to Screeps: grunt screeps

## Source Tree Layout

- Types: All Typescript interfaces/types/enums
- Modules: General logic modules such as spawning/room/empire
- Commands: Methods that are not used in the game loop. Only used directly in the console. Example: "require('roads').clearRoadConstructions(Game.spawns.Spawn1.room)"

## Roles

These are the different roles for our creeps:

| Role     | Purpose        |
| -------- | -------------- |
| RoleName | What is it for |
