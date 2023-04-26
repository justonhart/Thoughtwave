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
        const task = this.room.memory.labTasks[this.taskId];
        if (this.mineralType && (!task || task.needs.some((need) => need.lab === this.id && need.resource !== this.mineralType))) {
            return LabStatus.NEEDS_EMPTYING;
        } else if (task) {
            return task.reactionLabs.includes(this.id) ? LabStatus.IN_USE_PRIMARY : LabStatus.IN_USE_AUXILLARY;
        } else {
            return LabStatus.IDLE;
        }
    },
    enumerable: false,
    configurable: true,
});

/**
 * Returns the amount of space available in store MINUS any oustanding needs. Used for double-assigning boost tasks to labs with extra space
 */
StructureLab.prototype.getFreeCapacity = function (this: StructureLab) {
    const task = this.room.memory.labTasks[this.taskId];
    return (this.mineralType ? this.store.getFreeCapacity(this.mineralType) : 3000) - (task?.needs.find((need) => need.lab === this.id).amount ?? 0);
};
