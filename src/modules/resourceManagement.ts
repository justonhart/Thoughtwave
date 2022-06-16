export function manageEmpireResources() {
    let terminalRooms = Object.values(Game.rooms).filter((room) => room.controller?.my && room.terminal?.isActive());
    let roomsInNeed = terminalRooms.filter((room) => room.energyStatus < EnergyStatus.STABLE).sort((a, b) => a.energyStatus - b.energyStatus);
    let roomsInProgress = terminalRooms.filter((room) => room.controller.level < 8 && room.energyStatus < EnergyStatus.SURPLUS);

    // let reasonablePrice = Game.market.getHistory(RESOURCE_ENERGY).pop().avgPrice * .8;
    // let suitableEnergyOrders = Game.market.getAllOrders().filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && o.price >= reasonablePrice);

    terminalRooms
        .filter((room) => !room.terminal.cooldown)
        .forEach((room) => {
            if (hasExtraEnergy(room) && room.terminal.store.energy >= 50000) {
                if (roomsInNeed.length) {
                    let recipientName = findClosestRecipient(room, roomsInNeed);
                    let amountToSend = calculateEnergyToSend(room.name, recipientName);
                    let result = room.terminal.send(RESOURCE_ENERGY, amountToSend, recipientName);
                    if (result === OK) {
                        console.log(
                            `${room.name} sent ${amountToSend} energy to ${recipientName}: Cost: ${Game.market.calcTransactionCost(
                                amountToSend,
                                room.name,
                                recipientName
                            )}`
                        );
                        return;
                    } else {
                        console.log(
                            `${room.name} was unable to send energy to ${recipientName}: ${result} Cost: ${Game.market.calcTransactionCost(
                                amountToSend,
                                room.name,
                                recipientName
                            )}`
                        );
                    }
                } else if (roomsInProgress.length && hasTooMuchEnergy(room)) {
                    let recipientName = findClosestRecipient(room, roomsInProgress);
                    let amountToSend = calculateEnergyToSend(room.name, recipientName);
                    let result = room.terminal.send(RESOURCE_ENERGY, amountToSend, recipientName);
                    if (result === OK) {
                        console.log(
                            `${room.name} sent ${amountToSend} energy to ${recipientName}: Cost: ${Game.market.calcTransactionCost(
                                amountToSend,
                                room.name,
                                recipientName
                            )}`
                        );
                        return;
                    } else {
                        console.log(
                            `${room.name} was unable to send energy to ${recipientName}: ${result} Cost: ${Game.market.calcTransactionCost(
                                amountToSend,
                                room.name,
                                recipientName
                            )}`
                        );
                    }
                    // } else if(hasTooMuchEnergy(room) && suitableEnergyOrders.length){
                    //     let closestSuitableOrder = suitableEnergyOrders.map(o => {
                    //         return {order: o, distance: Game.map.getRoomLinearDistance(room.name, o.roomName)}
                    //     }).reduce((closest, next) => closest.distance < next.distance ? closest : next).order;
                    //     let result = Game.market.deal(closestSuitableOrder.id, Math.min(30000, closestSuitableOrder.remainingAmount), room.name);
                    //     if(result === OK){
                    //         console.log(`${room.name } completed order ${closestSuitableOrder.id}: Cost: ${Game.market.calcTransactionCost(30000, room.name, closestSuitableOrder.roomName)}`)
                    //     }
                    //     else{
                    //         console.log(`${room.name } was unable to complete order ${closestSuitableOrder.id}: ${result}`)
                    //     }
                }
            }

            let extraResources = getExtraResources(room);
            if (extraResources.length) {
                extraResources.forEach((resource) => {
                    let roomsInNeed = global.resourceNeeds[resource];
                    if (roomsInNeed?.length) {
                        let recipient = findClosestRecipient(
                            room,
                            roomsInNeed.map((roomName) => Game.rooms[roomName])
                        );
                        let amountToSend = Math.max(2500, 5000 - getResourceAmount(Game.rooms[recipient], resource));
                        let result = room.terminal.send(resource, amountToSend, recipient);
                        if (result === OK) {
                            console.log(
                                `${room.name} sent ${amountToSend} ${resource} to ${recipient}: Cost: ${Game.market.calcTransactionCost(
                                    amountToSend,
                                    room.name,
                                    recipient
                                )}`
                            );
                            return;
                        } else {
                            console.log(
                                `${room.name} was unable to send ${resource} to ${recipient}: ${result} Cost: ${Game.market.calcTransactionCost(
                                    amountToSend,
                                    room.name,
                                    recipient
                                )}`
                            );
                        }
                    }
                });
            }
        });
}

function hasExtraEnergy(room: Room): boolean {
    return room.energyStatus > EnergyStatus.STABLE;
}

function hasTooMuchEnergy(room: Room): boolean {
    return room.energyStatus === EnergyStatus.OVERFLOW || (room.controller.level === 8 && room.energyStatus > EnergyStatus.STABLE);
}

function findClosestRecipient(sender: Room, recipients: Room[]): string {
    let distanceMap = recipients.map((room) => {
        return { name: room.name, distance: Game.map.getRoomLinearDistance(sender.name, room.name) };
    });
    let closest = distanceMap.reduce((closestSoFar, next) => (closestSoFar.distance < next.distance ? closestSoFar : next));
    return closest.name;
}

function calculateEnergyToSend(senderName: string, recipientName: string) {
    let costPerTenThousand = Game.market.calcTransactionCost(10000, senderName, recipientName);
    let sendAmount = 10000 + costPerTenThousand;
    let multiple = 1;
    while (sendAmount * (multiple + 1) < 50000) {
        multiple++;
    }

    return 10000 * multiple;
}

function getRoomResourceNeeds(room: Room): ResourceConstant[] {
    let needs = [];
    const ALL_MINERALS_AND_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)] as ResourceConstant[];
    ALL_MINERALS_AND_COMPOUNDS.forEach((resource) => {
        if (getResourceAmount(room, resource) < 5000) {
            needs.push(resource);
        }
    });

    return needs;
}

function getResourceAmount(room: Room, resource: ResourceConstant): number {
    return (room.storage?.store[resource] ?? 0) + (room.terminal?.store[resource] ?? 0);
}

export function getAllRoomNeeds(): { [resource: string]: string[] } {
    let needs = {};

    Object.values(Game.rooms)
        .filter((room) => room.controller?.my && room.controller.level >= 6 && room.terminal)
        .forEach((room) => {
            let roomNeeds = getRoomResourceNeeds(room);
            roomNeeds.forEach((need) => {
                needs[need] = [...(needs[need] ?? []), room.name];
            });
        });

    return needs;
}

export function getExtraResources(room: Room): ResourceConstant[] {
    let extraResources = [];

    const ALL_MINERALS_AND_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)] as ResourceConstant[];
    ALL_MINERALS_AND_COMPOUNDS.forEach((resource) => {
        if (getResourceAmount(room, resource) >= 10000 && room.terminal[resource] >= 5000) {
            extraResources.push(resource);
        }
    });

    return extraResources;
}
