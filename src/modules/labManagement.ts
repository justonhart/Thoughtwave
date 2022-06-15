export function runLabs(room: Room) {
    if (!room.memory.labTasks) {
        room.memory.labTasks = [];
    }

    if (!room.memory.labRequests) {
        room.memory.labRequests = [];
    }

    //manage queue
    room.memory.labTasks = room.memory.labTasks.filter((task) => task.status !== TaskStatus.COMPLETE);

    let nextQueuedTaskIndex = room.memory.labTasks.findIndex((task) => task.status === TaskStatus.QUEUED);
    if (nextQueuedTaskIndex > -1) {
        let updatedTask = attemptToStartTask(room, room.memory.labTasks[nextQueuedTaskIndex]);

        if (updatedTask) {
            room.memory.labTasks[nextQueuedTaskIndex] = updatedTask;
        }
    }

    //run tasks
    room.labs.forEach((lab) => {
        if (lab.status === LabStatus.IN_USE_PRIMARY) {
            let task = lab.room.memory.labTasks[lab.taskIndex];

            if (task?.status === TaskStatus.ACTIVE) {
                switch (task.type) {
                    case LabTaskType.REACT:
                        task = runReactTask(task);
                        break;
                    case LabTaskType.REVERSE:
                        task = runReverseTask(task);
                        break;
                    case LabTaskType.BOOST:
                        task = runBoostTask(task);
                        break;
                    case LabTaskType.UNBOOST:
                        task = runUnboostTask(task);
                        break;
                }
            } else if (task?.status === TaskStatus.PREPARING) {
                let allNeedsFulfilled = task.reagentsNeeded
                    .map((need) => Game.getObjectById(need.lab).store[need.resource] >= need.amount)
                    .reduce((readyState, next) => readyState && next);

                if (allNeedsFulfilled) {
                    task.status = TaskStatus.ACTIVE;
                }
            }

            room.memory.labTasks[lab.taskIndex] = task;
        }
    });
}

function runReactTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    let targetCycles = task.reagentsNeeded[0].amount / 5;

    if (task.cyclesCompleted < targetCycles) {
        let result = primaryLab.runReaction(auxillaryLabs[0], auxillaryLabs[1]);
        if (result === OK) {
            task.cyclesCompleted++;
        }
    } else {
        task.status = TaskStatus.COMPLETE;
    }

    return task;
}

function runReverseTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    let targetCycles = task.reagentsNeeded[0].amount / 5;

    if (task.cyclesCompleted < targetCycles) {
        let result = primaryLab.reverseReaction(auxillaryLabs[0], auxillaryLabs[1]);
        if (result === OK) {
            task.cyclesCompleted++;
        }
    } else {
        task.status = TaskStatus.COMPLETE;
    }

    return task;
}

function runBoostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let targetCreep = Game.getObjectById(task.targetCreep);

    if (targetCreep.pos.isNearTo(primaryLab)) {
        let result = primaryLab.boostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

function runUnboostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let targetCreep = Game.getObjectById(task.targetCreep);

    if (targetCreep.pos.isNearTo(primaryLab)) {
        let result = primaryLab.unboostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

export function findLabs(room: Room, auxillaryLabsNeeded: boolean = false): Id<StructureLab>[] {
    let availableLabs = room.labs.filter((s) => s.status === LabStatus.AVAILABLE);

    if (!availableLabs.length) {
        return undefined;
    }

    if (auxillaryLabsNeeded) {
    } else {
        return [availableLabs.pop()?.id];
    }
}

export function addLabTask(room: Room, opts: LabTaskOpts) {
    let task: LabTask = {
        status: TaskStatus.QUEUED,
        ...opts,
    };

    room.memory.labTasks.push(task);
}

function attemptToStartTask(room: Room, task: LabTask): LabTask {
    let auxNeeded = task.type === LabTaskType.REACT || task.type === LabTaskType.REVERSE;
    let labs: Id<StructureLab>[] = findLabs(room, auxNeeded);
    if (labs) {
        task.primaryLab = labs.shift();
        if (auxNeeded) {
            if (task.type === LabTaskType.REACT) {
                task.reagentsNeeded.forEach((need) => {
                    need.lab = labs.shift();
                });
            } else {
                task.reagentsNeeded[0].lab = task.primaryLab;
            }

            task.cyclesCompleted = 0;
        } else {
            if (task.type === LabTaskType.BOOST) {
                task.reagentsNeeded[0].lab = task.primaryLab;
            }
        }

        task.reagentsNeeded.forEach((need) => {
            room.memory.labRequests.push(need);
        });

        task.status = TaskStatus.PREPARING;
        return task;
    }

    return undefined;
}
