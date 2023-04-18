const BOOST_MAP: { [key in BoostType]: ResourceConstant } = {
    [BoostType.ATTACK]: RESOURCE_CATALYZED_UTRIUM_ACID,
    [BoostType.HARVEST]: RESOURCE_CATALYZED_UTRIUM_ALKALIDE,
    [BoostType.CARRY]: RESOURCE_CATALYZED_KEANIUM_ACID,
    [BoostType.RANGED_ATTACK]: RESOURCE_CATALYZED_KEANIUM_ALKALIDE,
    [BoostType.BUILD]: RESOURCE_CATALYZED_LEMERGIUM_ACID,
    [BoostType.HEAL]: RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
    [BoostType.DISMANTLE]: RESOURCE_CATALYZED_ZYNTHIUM_ACID,
    [BoostType.MOVE]: RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
    [BoostType.UPGRADE]: RESOURCE_CATALYZED_GHODIUM_ACID,
    [BoostType.TOUGH]: RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
};

export function runLabs(room: Room) {
    //manage queue
    Object.entries(room.memory.labTasks).forEach(([taskId, task]) => {
        switch (task.status) {
            case TaskStatus.QUEUED:
                attemptToStartTask(room, taskId);
                break;
            case TaskStatus.COMPLETE:
                delete room.memory.labTasks[taskId];
                break;
        }
    });

    let labs = room.labs;
    let labsInUse = labs.filter((lab) => lab.status !== LabStatus.AVAILABLE);
    let primaryLabsInUse = labs.filter((lab) => lab.status === LabStatus.IN_USE_PRIMARY);

    // //if there are 4 or more available labs, try to add react task
    // if (
    //     labs.length - labsInUse.length > 3 &&
    //     !Object.values(room.memory.labTasks).some((task) => task.type === LabTaskType.REACT && task.status !== TaskStatus.ACTIVE)
    // ) {
    //     let resourceToMake = getNextResourceToCreate(room);
    //     if (resourceToMake) {
    //         let reagents = getReagents(resourceToMake);
    //         let amountToCreate = Math.min(...reagents.map((resource) => room.getResourceAmount(resource)), 3000);
    //         while (amountToCreate % 5) {
    //             amountToCreate--;
    //         }

    //         let result = room.addLabTask({
    //             type: LabTaskType.REACT,
    //             needs: reagents.map((r) => {
    //                 return { resource: r, amount: amountToCreate };
    //             }),
    //         });
    //         if (result === OK) {
    //             console.log(`${Game.time} - ${room.name} added task to create ${amountToCreate} ${resourceToMake}`);
    //         }
    //     }
    // }

    //run tasks
    primaryLabsInUse.forEach((lab) => {
        let task = lab.room.memory.labTasks[lab.taskId];
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
            let canStartTask: boolean;
            if (task?.type === LabTaskType.BOOST && !Game.creeps[task.targetCreepName]) {
                task.status = TaskStatus.COMPLETE;
            } else {
                canStartTask =
                    task?.type === LabTaskType.BOOST
                        ? task.needs
                              .map((need) => need.amount === 0 && Game.getObjectById(need.lab).store[RESOURCE_ENERGY] >= 1000)
                              .reduce((readyState, next) => readyState && next)
                        : task.needs
                              .map((need) => Game.getObjectById(need.lab).store[need.resource] > 0)
                              .reduce((readyState, next) => readyState && next);
            }

            if (canStartTask) {
                task.status = TaskStatus.ACTIVE;
            }
        }

        room.memory.labTasks[lab.taskId] = task;
    });
}

function runReactTask(task: LabTask): LabTask {
    let primaryLabs = task.reactionLabs.map((id) => Game.getObjectById(id));
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    if (!auxillaryLabs.map((lab) => !lab.mineralType || lab.store[lab.mineralType] < 5).reduce((anyEmpty, next) => anyEmpty || next)) {
        primaryLabs.forEach((lab) => {
            lab.runReaction(auxillaryLabs[0], auxillaryLabs[1]);
        });
    } else {
        task.status = TaskStatus.COMPLETE;
    }

    return task;
}

function runReverseTask(task: LabTask): LabTask {
    let primaryLabs = task.reactionLabs.map((id) => Game.getObjectById(id));
    let auxillaryLabs = task.auxillaryLabs.map((id) => Game.getObjectById(id));

    if (primaryLabs[0].mineralType) {
        primaryLabs.forEach((lab) => {
            lab.reverseReaction(auxillaryLabs[0], auxillaryLabs[1]);
        });
    } else {
        task.status = TaskStatus.COMPLETE;
    }

    return task;
}

function runBoostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.reactionLabs[0]);
    let targetCreep = Game.creeps[task.targetCreepName];

    if (!targetCreep) {
        task.status = TaskStatus.COMPLETE;
    } else if (targetCreep?.pos.isNearTo(primaryLab)) {
        let result = primaryLab.boostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

function runUnboostTask(task: LabTask): LabTask {
    let primaryLab = Game.getObjectById(task.reactionLabs[0]);
    let targetCreep = Game.creeps[task.targetCreepName];

    if (targetCreep?.pos.isNearTo(primaryLab)) {
        let result = primaryLab.unboostCreep(targetCreep);
        if (result === OK) {
            task.status = TaskStatus.COMPLETE;
        }
    }

    return task;
}

export function findLabs(room: Room, type: LabTaskType): Id<StructureLab>[][] {
    let availableLabs = room.labs.filter((lab) => lab.status === LabStatus.AVAILABLE);

    if (!availableLabs.length) {
        return undefined;
    }

    let primaryLabs: StructureLab[] = [];
    let auxLabs: StructureLab[] = [];

    if (type === LabTaskType.BOOST || type === LabTaskType.UNBOOST) {
        primaryLabs[0] = availableLabs.pop();
    } else {
        let labsNeedingEmptied = room.labs.filter((lab) => lab.status === LabStatus.NEEDS_EMPTYING);
        if (labsNeedingEmptied.length || availableLabs.length < 3) {
            return undefined;
        } else {
            if (type === LabTaskType.REACT) {
                //can use multiple reaction labs to speed up task - find aux labs first
                //find available labs w/ most adjacent labs
                let labsWithAdjacentCount = availableLabs
                    .map((lab) => {
                        return {
                            lab: lab,
                            inRangeCount: lab.pos.findInRange(FIND_MY_STRUCTURES, 2, {
                                filter: (adjacentLab) => adjacentLab?.id !== lab?.id && availableLabs.includes(adjacentLab as StructureLab),
                            }).length,
                        };
                    })
                    .filter((lab) => lab.inRangeCount > 1)
                    .sort((a, b) => b.inRangeCount - a.inRangeCount)
                    .map((labWithCount) => labWithCount.lab);

                if (labsWithAdjacentCount.length < 3) {
                    return undefined;
                }

                auxLabs = labsWithAdjacentCount.splice(0, 2);
                for (let i = 0; i < labsWithAdjacentCount.length && auxLabs.length + primaryLabs.length < availableLabs.length - 1; i++) {
                    if (labsWithAdjacentCount[i].pos.inRangeTo(auxLabs[0], 2) && labsWithAdjacentCount[i].pos.inRangeTo(auxLabs[1], 2)) {
                        primaryLabs.push(labsWithAdjacentCount[i]);
                    }
                }

                if (!primaryLabs.length) {
                    return undefined;
                }
            } else {
                let suitablePrimaryLab = availableLabs.find((lab, index) => {
                    let adjacentAvailableLabs = availableLabs.filter((auxLab, auxIndex) => auxIndex !== index && lab.pos.getRangeTo(auxLab) <= 2);
                    return adjacentAvailableLabs.length >= 2;
                });

                if (suitablePrimaryLab) {
                    primaryLabs[0] = suitablePrimaryLab;
                    let availableAuxLabs = availableLabs.filter(
                        (auxLab) => auxLab.id !== primaryLabs[0].id && primaryLabs[0].pos.getRangeTo(auxLab) <= 2
                    );
                    while (auxLabs.length < 2) {
                        auxLabs.push(availableAuxLabs.shift());
                    }
                } else {
                    return undefined;
                }
            }
        }
    }

    return [primaryLabs.map((lab) => lab?.id), auxLabs.map((lab) => lab?.id)];
}

export function addLabTask(room: Room, opts: LabTaskPartial): OK | ERR_NOT_ENOUGH_RESOURCES {
    //check room for necessary resources
    let roomHasAllResources = opts.needs.map((need) => roomHasNeededResource(room, need)).reduce((hasNeeded, nextNeed) => hasNeeded && nextNeed);

    if (roomHasAllResources) {
        let task: LabTask = {
            status: TaskStatus.QUEUED,
            ...opts,
        };

        let nextId = 1;
        while (room.memory.labTasks[nextId] !== undefined) {
            nextId++;
        }

        room.memory.labTasks[nextId] = task;
        return OK;
    }

    return ERR_NOT_ENOUGH_RESOURCES;
}

function attemptToStartTask(room: Room, taskId: string): void {
    let task: LabTask = room.memory.labTasks[taskId];
    let labsFound: Id<StructureLab>[][] = findLabs(room, task.type);
    if (labsFound) {
        task.reactionLabs = labsFound[0];
        if (task.type === LabTaskType.REACT || task.type === LabTaskType.REVERSE) {
            task.auxillaryLabs = labsFound[1];
            if (task.type === LabTaskType.REACT) {
                task.needs.forEach((need, index) => {
                    need.lab = task.auxillaryLabs[index];
                });
            } else {
                task.needs[0].lab = task.reactionLabs[0];
            }
        } else if (task.type === LabTaskType.BOOST) {
            task.needs[0].lab = task.reactionLabs[0];

            if (!Game.creeps[task.targetCreepName]) {
                task.status = TaskStatus.COMPLETE;
                room.memory.labTasks[taskId] = task;
                return;
            }
        }

        task.status = TaskStatus.PREPARING;
        room.memory.labTasks[taskId] = task;
    }
}

function roomHasNeededResource(room: Room, need: LabNeed) {
    return room.getResourceAmount(need.resource) >= need.amount;
}

/**
 * Takes in a room and array, and returns the number of boosts per type the room currently has available and unallocated.
 * @param room
 * @param boostNeeds
 * @returns map of boost types to number of boosts available
 */
export function getBoostsAvailable(room: Room, boostNeeds: BoostType[]): { [type: number]: number } {
    const boostCountMap: { [type: number]: number } = {};
    boostNeeds.forEach((type) => {
        const resourceNeeded = BOOST_MAP[type];
        const resourceAmountInRoom = room.getResourceAmount(resourceNeeded);
        boostCountMap[type] = Math.floor(resourceAmountInRoom / 30);
    });

    return boostCountMap;
}

//find next needed resource that room can currently create
export function getNextResourceToCreate(room: Room): MineralCompoundConstant {
    return Object.keys(global.resourceNeeds)
        .filter((res) => !['H', 'O', 'U', 'L', 'Z', 'K'].includes(res))
        .find(
            (resource) => global.resourceNeeds[resource].length && hasNecessaryReagentsForReaction(room, resource as MineralCompoundConstant)
        ) as MineralCompoundConstant;
}

export function hasNecessaryReagentsForReaction(room: Room, compound: MineralCompoundConstant): boolean {
    return getReagents(compound)
        .map((resource) => room.getResourceAmount(resource) > 450)
        .reduce((hasAll, next) => hasAll && next);
}

export function getReagents(compound: MineralCompoundConstant): ResourceConstant[] {
    let reagents = [];

    if (compound.length === 2) {
        reagents = compound.split('');
    } else if (compound.startsWith('X')) {
        reagents = ['X', compound.substring(1, compound.length)];
    } else if (compound.includes('H2')) {
        reagents = [compound.charAt(0) + 'H', 'OH'];
    } else if (compound.includes('O2')) {
        reagents = [compound.charAt(0) + 'O', 'OH'];
    } else if (compound === 'G') {
        reagents = ['ZK', 'UL'];
    }

    return reagents;
}

export function spawnBoostTestCreep(roomName?: string) {
    const spawnOpts: SpawnOptions = {
        boosts: [BoostType.MOVE],
        memory: {
            role: Role.GO,
        },
    };
    const spawnAssignment: SpawnAssignment = {
        designee: roomName ?? 'E23S43',
        spawnOpts: spawnOpts,
        body: [MOVE],
    };
    Memory.spawnAssignments.push(spawnAssignment);
}
