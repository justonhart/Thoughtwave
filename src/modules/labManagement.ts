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
    let targetCreep = Game.creeps[task.targetCreepName];

    if (targetCreep?.pos.isNearTo(primaryLab)) {
        let result = primaryLab.boostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

function runUnboostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.primaryLab);
    let targetCreep = Game.creeps[task.targetCreepName];

    if (targetCreep?.pos.isNearTo(primaryLab)) {
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

    let primaryLab;
    let auxLabs: StructureLab[] = [];

    if (!auxillaryLabsNeeded) {
        primaryLab = availableLabs.pop();
    } else {
        let suitablePrimaryLab = availableLabs.find((lab, index) => {
            let adjacentAvailableLabs = availableLabs.filter((auxLab, auxIndex) => auxIndex !== index && lab.pos.getRangeTo(auxLab) <= 2);
            return adjacentAvailableLabs.length >= 2;
        });

        if (suitablePrimaryLab) {
            primaryLab = suitablePrimaryLab;
            let availableAuxLabs = availableLabs.filter((auxLab) => auxLab.id !== primaryLab.id && primaryLab.pos.getRangeTo(auxLab) <= 2);
            while (auxLabs.length < 2) {
                auxLabs.push(availableAuxLabs.shift());
            }
        } else {
            return undefined;
        }
    }

    return [primaryLab, ...auxLabs].map((lab) => lab.id);
}

export function addLabTask(room: Room, opts: LabTaskOpts): ScreepsReturnCode {
    //check room for necessary resources
    let roomHasAllResources = opts.reagentsNeeded
        .map((need) => roomHasNeededResource(room, need))
        .reduce((hasNeeded, nextNeed) => hasNeeded && nextNeed);

    if (roomHasAllResources) {
        let task: LabTask = {
            status: TaskStatus.QUEUED,
            ...opts,
        };

        room.memory.labTasks.push(task);
        return OK;
    }

    return ERR_NOT_ENOUGH_RESOURCES;
}

function attemptToStartTask(room: Room, task: LabTask): LabTask {
    let auxNeeded = task.type === LabTaskType.REACT || task.type === LabTaskType.REVERSE;
    let labs: Id<StructureLab>[] = findLabs(room, auxNeeded);
    if (labs) {
        task.primaryLab = labs.shift();
        if (auxNeeded) {
            task.auxillaryLabs = labs;
            if (task.type === LabTaskType.REACT) {
                task.reagentsNeeded.forEach((need, index) => {
                    need.lab = task.auxillaryLabs[index];
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

function roomHasNeededResource(room: Room, need: LabNeed) {
    return room.storage?.store[need.resource] >= need.amount ? true : room.terminal?.store[need.resource] >= need.amount ? true : false;
}

export function getResourceBoostsAvailable(
    room: Room,
    boostNeeds: BoostType[]
): { [type: number]: { resource: ResourceConstant; amount: number }[] } {
    let availableResources: { [type: number]: { resource: ResourceConstant; amount: number }[] } = {};

    let getBoostAvailabilityForResource = (room: Room, resource: ResourceConstant) => {
        return Math.floor(((room.storage?.store[resource] ?? 0) + (room.terminal?.store[resource] ?? 0)) / 30);
    };

    if (boostNeeds.includes(BoostType.ATTACK)) {
        Object.keys(BOOSTS[ATTACK]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.ATTACK] = [
                    ...(availableResources[BoostType.ATTACK as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });

        availableResources[BoostType.ATTACK] = availableResources[BoostType.ATTACK]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.RANGED_ATTACK)) {
        Object.keys(BOOSTS[RANGED_ATTACK]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.RANGED_ATTACK] = [
                    ...(availableResources[BoostType.RANGED_ATTACK as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.RANGED_ATTACK] = availableResources[BoostType.RANGED_ATTACK]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.HEAL)) {
        Object.keys(BOOSTS[HEAL]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.HEAL] = [
                    ...(availableResources[BoostType.HEAL as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.HEAL] = availableResources[BoostType.HEAL]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.CARRY)) {
        Object.keys(BOOSTS[CARRY]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.CARRY] = [
                    ...(availableResources[BoostType.CARRY as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.CARRY] = availableResources[BoostType.CARRY]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.MOVE)) {
        Object.keys(BOOSTS[MOVE]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.MOVE] = [
                    ...(availableResources[BoostType.MOVE as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.MOVE] = availableResources[BoostType.MOVE]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.TOUGH)) {
        Object.keys(BOOSTS[TOUGH]).forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.TOUGH] = [
                    ...(availableResources[BoostType.TOUGH as number] ?? []),
                    { resource: resource as ResourceConstant, amount },
                ];
            }
        });
        availableResources[BoostType.TOUGH] = availableResources[BoostType.TOUGH]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.UPGRADE)) {
        [RESOURCE_GHODIUM_HYDRIDE, RESOURCE_GHODIUM_ACID, RESOURCE_CATALYZED_GHODIUM_ACID].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.UPGRADE] = [...(availableResources[BoostType.UPGRADE as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.UPGRADE] = availableResources[BoostType.UPGRADE]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.BUILD)) {
        [RESOURCE_LEMERGIUM_HYDRIDE, RESOURCE_LEMERGIUM_ACID, RESOURCE_CATALYZED_LEMERGIUM_ACID].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.BUILD] = [...(availableResources[BoostType.BUILD as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.BUILD] = availableResources[BoostType.BUILD]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.DISMANTLE)) {
        [RESOURCE_ZYNTHIUM_HYDRIDE, RESOURCE_ZYNTHIUM_ACID, RESOURCE_CATALYZED_ZYNTHIUM_ACID].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.DISMANTLE] = [...(availableResources[BoostType.DISMANTLE as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.DISMANTLE] = availableResources[BoostType.DISMANTLE]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    if (boostNeeds.includes(BoostType.HARVEST)) {
        [RESOURCE_UTRIUM_OXIDE, RESOURCE_UTRIUM_ALKALIDE, RESOURCE_CATALYZED_UTRIUM_ALKALIDE].forEach((resource) => {
            let amount = getBoostAvailabilityForResource(room, resource as ResourceConstant);
            if (amount) {
                availableResources[BoostType.HARVEST] = [...(availableResources[BoostType.HARVEST as number] ?? []), { resource, amount }];
            }
        });
        availableResources[BoostType.HARVEST] = availableResources[BoostType.HARVEST]?.sort(
            (a, b) =>
                Object.keys(REACTION_TIME).findIndex((res) => res === b.resource) - Object.keys(REACTION_TIME).findIndex((res) => res === a.resource)
        );
    }

    return availableResources;
}
