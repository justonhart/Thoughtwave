export function unfollowStructures() {
    Object.values(Game.structures)
        .filter((struct) => struct.structureType !== STRUCTURE_SPAWN)
        .forEach((struct) => {
            struct.notifyWhenAttacked(false);
        });
}

export function getArea(pos: RoomPosition, range: number) {
    const top = pos.y - range < 0 ? 0 : pos.y - range;
    const bottom = pos.y + range > 49 ? 49 : pos.y + range;
    const left = pos.x - range < 0 ? 0 : pos.x - range;
    const right = pos.x + range > 49 ? 49 : pos.x + range;
    return { top, left, bottom, right };
}
