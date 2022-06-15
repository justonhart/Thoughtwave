Object.defineProperty(StructureLab.prototype, 'taskIndex', {
    get: function (this: StructureLab) {
        let index = this.room.memory.labTasks.findIndex((task) => task.primaryLab === this.id || task.auxillaryLabs?.includes(this.id));
        return index > -1 ? index : undefined;
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'status', {
    get: function (this: StructureLab) {
        return !this.room.memory.labTasks[this.taskIndex]
            ? !this.mineralType
                ? LabStatus.AVAILABLE
                : LabStatus.NEEDS_EMPTYING
            : this.room.memory.labTasks[this.taskIndex].primaryLab === this.id
            ? LabStatus.IN_USE_PRIMARY
            : LabStatus.IN_USE_AUXILLARY;
    },
    enumerable: false,
    configurable: true,
});
