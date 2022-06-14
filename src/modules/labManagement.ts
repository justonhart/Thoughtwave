export function runLabs(room: Room) {
    if (!room.memory.labTasks) {
        room.memory.labTasks = [];
    }

    // room.memory.labTasks.forEach(task => {
    //     if(task.status === TaskStatus.PREPARING){
    //         switch(task.type){

    //         }
    //     }
    // });

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

                room.memory.labTasks[this.taskIndex] = task;
            }
        }
    });
}

function runReactTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    let targetCycles = task.labNeeds[0].amount / 5;

    if (task.cyclesCompleted < targetCycles) {
        let result = primaryLab.runReaction(auxillaryLabs[0], auxillaryLabs[1]);
        if (result === OK) {
            task.cyclesCompleted++;
        }
    } else {
        task.status = TaskStatus.CLEANUP;
    }

    return task;
}

function runReverseTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    let targetCycles = task.labNeeds[0].amount / 5;

    if (task.cyclesCompleted < targetCycles) {
        let result = primaryLab.reverseReaction(auxillaryLabs[0], auxillaryLabs[1]);
        if (result === OK) {
            task.cyclesCompleted++;
        }
    } else {
        task.status = TaskStatus.CLEANUP;
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

export function findLabs(room: Room, resourceAmount: number, auxillaryLabsNeeded: boolean = false): Id<StructureLab>[] {
    let runningTasks = room.memory.labTasks.filter((task) => task.status !== TaskStatus.QUEUED);

    let labs = room.find(FIND_MY_STRUCTURES).filter((s) => s.structureType === STRUCTURE_LAB && s.isActive()) as StructureLab[];
    let labsInUseIds = _.flatten(runningTasks.map((task) => [task.primaryLab, ...task.auxillaryLabs])) as Id<StructureLab>[];

    let availablePrimaryLabs = labs.filter((s) => !labsInUseIds.includes(s.id));

    if (!availablePrimaryLabs.length) {
        return undefined;
    }

    if (auxillaryLabsNeeded) {
        // let labResourceReservationMap = labsInUseIds.map(id => {
        //     return {
        //         id: id,
        //         reservedResources: room.memory.labTasks
        //             .filter(task => task.auxillaryLabs.includes(id))
        //             .map(task => task.reagentsNeeded[0].amount)
        //             .reduce((sum, next) => sum + next)
        //     }
        // });
        // let availableAuxLabs =
        //     labs.filter(lab =>
        //         !runningTasks.map(task => task.primaryLab).includes(lab.id) &&
        //         ((labResourceReservationMap.find(entry => entry.id === lab.id).reservedResources < 3000 -  resourceAmount) ?? true)
        //     );
    } else {
        return [availablePrimaryLabs.pop()?.id];
    }
}

export function addLabTask(room: Room, opts: LabTaskOpts) {
    let auxNeeded = opts.type === LabTaskType.REACT || opts.type === LabTaskType.REVERSE;
    let labs = findLabs(room, opts.reagentsNeeded[0].amount, auxNeeded);

    let task: LabTask = {
        primaryLab: labs?.[0],
        auxillaryLabs: auxNeeded ? [labs[1], labs[2]] : undefined,
        status: labs ? TaskStatus.PREPARING : TaskStatus.QUEUED,
        ...opts,
    };

    room.memory.labTasks.push(task);
}
