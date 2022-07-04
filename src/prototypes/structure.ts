Structure.prototype.getRampart = function (this: Structure): StructureRampart {
    return this.pos.lookFor(LOOK_STRUCTURES).find((s) => s.structureType === STRUCTURE_RAMPART) as StructureRampart;
};
