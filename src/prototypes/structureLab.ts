Object.defineProperty(StructureLab.prototype, 'taskId', {
    get: function (this: StructureLab) {
        return Object.entries(this.room.memory.labTasks).find(
            (task) => task[1].reactionLabs?.includes(this.id) || task[1].auxillaryLabs?.includes(this.id)
        )?.[0];
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'status', {
    get: function (this: StructureLab) {
        return !this.room.memory.labTasks[this.taskId]
            ? !this.mineralType
                ? LabStatus.AVAILABLE
                : LabStatus.NEEDS_EMPTYING
            : this.room.memory.labTasks[this.taskId].reactionLabs?.includes(this.id)
            ? LabStatus.IN_USE_PRIMARY
            : LabStatus.IN_USE_AUXILLARY;
    },
    enumerable: false,
    configurable: true,
});
