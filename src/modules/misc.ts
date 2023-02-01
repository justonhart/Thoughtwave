export function unfollowStructures() {
    Object.values(Game.structures)
        .filter((struct) => struct.structureType !== STRUCTURE_SPAWN)
        .forEach((struct) => {
            struct.notifyWhenAttacked(false);
        });
}
