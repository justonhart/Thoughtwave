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
            ? LabStatus.AVAILABLE
            : this.room.memory.labTasks[this.taskIndex].primaryLab === this.id
            ? LabStatus.IN_USE_PRIMARY
            : LabStatus.IN_USE_AUXILLARY;
    },
    enumerable: false,
    configurable: true,
});

Object.defineProperty(StructureLab.prototype, 'need', {
    get: function (this: StructureLab) {
        let task = this.room.memory.labTasks[this.taskIndex];

        return task?.status === TaskStatus.PREPARING && !task.labNeeds.find((need) => need.lab === this.id).fulfilled
            ? !this.room.memory.labRequests.find((req) => req.lab === this.id)
            : undefined;
    },
    enumerable: false,
    configurable: true,
});
