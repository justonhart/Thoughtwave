export function manageEmpireResources() {
    //Manage shipments not associated to requests - those will be handled with requests
    Object.entries(Memory.shipments)
        .filter(([shipmentId, shipment]) => !shipment.requestId)
        .forEach(([shipmentId, shipment]) => {
            if (shipment.status === ShipmentStatus.SHIPPED && !shipment.requestId) {
                delete Memory.shipments[shipmentId];
            } else if (shipment.status === ShipmentStatus.FAILED) {
                console.log(`Shipment failed unexpectedly: ${shipment.recipient} - ${shipment.resource}`);
                delete Memory.shipments[shipmentId];
            }
        });

    let terminalRooms = Object.values(Game.rooms).filter((room) => room.controller?.my && room.terminal?.isActive());

    //distribute energy throughout empire
    if (Game.time % 25 === 0) {
        const roomEnergyMap = terminalRooms.map((room) => ({
            energyTier: Math.floor(room.getResourceAmount(RESOURCE_ENERGY) / 100000),
            roomName: room.name,
        }));
        let energyShipments: { sender: string; recipient: string; amount: number }[] = [];

        roomEnergyMap
            .filter((e) => e.energyTier > 2 && !Memory.rooms[e.roomName].shipments.some((id) => Memory.shipments[id]?.resource === RESOURCE_ENERGY))
            .forEach((sender) => {
                let recipient = roomEnergyMap.find(
                    (otherEntry) => sender.energyTier > 1 + otherEntry.energyTier && !energyShipments.some((s) => s.recipient === otherEntry.roomName)
                )?.roomName;
                if (recipient) {
                    let amountToSend = calculateEnergyToSend(sender.roomName, recipient);
                    energyShipments.push({ sender: sender.roomName, recipient: recipient, amount: amountToSend });
                }
            });

        energyShipments.forEach((shipmentToCreate) => {
            const shipment: Shipment = {
                sender: shipmentToCreate.sender,
                resource: RESOURCE_ENERGY,
                recipient: shipmentToCreate.recipient,
                amount: shipmentToCreate.amount,
            };
            addShipment(shipment);
        });
    }

    //manage resource requests - if rooms have this resource, they should send it regardless of how much they have
    Object.entries(Memory.resourceRequests).forEach(([requestId, request]) => {
        switch (request.status) {
            case ResourceRequestStatus.SUBMITTED:
                const suppliers = terminalRooms
                    .map((room) => ({ roomName: room.name, amount: room.getResourceAmount(request.resource) }))
                    .filter((supplier) => supplier.roomName !== request.room && supplier.amount);
                const enoughSupply = suppliers.reduce((sum, nextSupplier) => sum + nextSupplier.amount, 0) >= request.amount;
                if (suppliers.length && enoughSupply) {
                    let amountCommitted = 0;
                    for (let i = 0; i < suppliers.length && amountCommitted < request.amount; i++) {
                        const shipment: Shipment = {
                            sender: suppliers[i].roomName,
                            recipient: request.room,
                            amount: Math.min(suppliers[i].amount, request.amount - amountCommitted),
                            resource: request.resource,
                            requestId: requestId,
                        };
                        addShipment(shipment);
                        amountCommitted += suppliers[i].amount;
                    }

                    if (amountCommitted >= request.amount) {
                        Memory.resourceRequests[requestId].status = ResourceRequestStatus.ASSIGNED;
                    }
                } else {
                    Memory.resourceRequests[requestId].status = ResourceRequestStatus.FAILED;
                }
                break;
            case ResourceRequestStatus.ASSIGNED:
                const allShipmentsCompleted = request.shipments.every((id) => Memory.shipments[id]?.status === ShipmentStatus.SHIPPED);
                if (allShipmentsCompleted) {
                    Memory.resourceRequests[requestId].status = ResourceRequestStatus.FULFULLED;
                } else if (request.shipments.some((id) => Memory.shipments[id].status === ShipmentStatus.FAILED)) {
                    Memory.resourceRequests[requestId].shipments = request.shipments.filter(
                        (id) => Memory.shipments[id].status !== ShipmentStatus.FAILED
                    );
                    Memory.resourceRequests[requestId].status = ResourceRequestStatus.SUBMITTED;
                }
                break;
            case ResourceRequestStatus.FAILED:
                console.log(`Resource request failed unexpectedly: ${request.room} - ${request.resource}`);
                delete Memory.resourceRequests[requestId];
                break;
            case ResourceRequestStatus.FULFULLED:
                if (Memory.debug.logShipments)
                    console.log(`${Game.time} - Request fulfilled: ${request.amount} ${request.resource} for ${request.room}`);
                request.shipments.forEach((id) => delete Memory.shipments[id]);
                delete Memory.resourceRequests[requestId];
                break;
        }
    });

    // //identify resource needs and distribute extra
    // terminalRooms
    //     .filter((room) => room.energyStatus >= EnergyStatus.STABLE && room.memory.shipments.length < 3)
    //     .forEach((room) => {
    //         const extraResources = getExtraResources(room);
    //         extraResources.forEach((extraResource) => {
    //             const roomsNeedingResource = global.resourceNeeds[extraResource.resource]?.filter(
    //                 (need) =>
    //                     !Object.values(Memory.shipments).some(
    //                         (shipment) => shipment.resource === extraResource.resource && shipment.recipient === need.roomName
    //                     )
    //             );
    //             const excessAmount = extraResource.amountExtra;

    //             if (roomsNeedingResource?.length) {
    //                 const roomToSupply = findClosestRecipient(room, roomsNeedingResource);
    //                 if (roomToSupply) {
    //                     const amountToSend = Math.min(excessAmount, roomToSupply.amountNeeded);
    //                     const shipment: Shipment = {
    //                         sender: room.name,
    //                         resource: extraResource.resource,
    //                         amount: amountToSend,
    //                         recipient: roomToSupply.roomName,
    //                     };

    //                     addShipment(shipment);
    //                 }
    //             }
    //         });
    //     });
}

function findClosestRecipient(sender: Room, recipients: any[]): { roomName: string; amountNeeded: number } {
    let distanceMap = recipients.map((need) => {
        return { name: need.roomName, amount: need.amountNeeded, distance: Game.map.getRoomLinearDistance(sender.name, need.roomName) };
    });
    let closest = distanceMap.reduce((closestSoFar, next) => (closestSoFar.distance < next.distance ? closestSoFar : next));
    return { roomName: closest.name, amountNeeded: closest.amount };
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

export function getRoomResourceNeeds(room: Room): { resource: ResourceConstant; amount: number }[] {
    let needs = [];
    const ALL_MINERALS_AND_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)] as ResourceConstant[];
    ALL_MINERALS_AND_COMPOUNDS.forEach((resource) => {
        let need = (resource.charAt(0) === 'X' && resource.length > 1 ? 20000 : 5000) - room.getResourceAmount(resource);
        if (need > 0) {
            needs.push({ resource: resource, amount: need });
        }
    });

    return needs;
}

export function getAllRoomNeeds(): { [resource: string]: { roomName: string; amount: number }[] } {
    let needs = {};

    Object.values(Game.rooms)
        .filter((room) => room.controller?.my && room.controller.level >= 6 && room.terminal)
        .forEach((room) => {
            let roomNeeds = getRoomResourceNeeds(room);
            roomNeeds.forEach((need) => {
                needs[need.resource] = [...(needs[need.resource] ?? []), { roomName: room.name, amount: need.amount }];
            });
        });

    return needs;
}

export function getExtraResources(room: Room): { resource: ResourceConstant; amount: number }[] {
    let extraResources: { resource: ResourceConstant; amount: number }[] = [];

    const ALL_MINERALS_AND_COMPOUNDS = [...Object.keys(MINERAL_MIN_AMOUNT), ...Object.keys(REACTION_TIME)] as ResourceConstant[];
    ALL_MINERALS_AND_COMPOUNDS.forEach((resource) => {
        const maxResourceAmount = resource.charAt(0) === 'X' && resource.length > 1 ? 20000 : 5000;
        const amountExtra = room.getResourceAmount(resource) - maxResourceAmount;
        if (amountExtra > 0) {
            extraResources.push({ resource: resource, amount: amountExtra });
        }
    });

    return extraResources;
}

export function shipmentReady(terminal: StructureTerminal, shipmentId: number): boolean {
    const shipment = Memory.shipments[shipmentId];
    let energyNeeded =
        Game.market.calcTransactionCost(shipment.amount, terminal.room.name, shipment.recipient) +
        (shipment.resource === RESOURCE_ENERGY ? shipment.amount : 0);

    return terminal.store[shipment.resource] >= shipment.amount && terminal.store.energy >= energyNeeded;
}

function getQualifyingMarketOrders() {
    let marketOrders = Game.market
        .getAllOrders()
        .filter((o) => o.type === ORDER_BUY && !Memory.blacklistedRooms.includes(o.roomName) && o.price >= 0.85 * Memory.priceMap[o.resourceType]);
    global.qualifyingMarketOrders = {};
    Object.keys(Memory.priceMap).forEach((res) => {
        let orderId = marketOrders.find((order) => order.resourceType === res)?.id;
        if (orderId) {
            global.qualifyingMarketOrders[res] = orderId;
        }
    });
}

function updateBlacklistedRooms() {
    let orders = Game.market.outgoingTransactions.filter((o) => Memory.marketBlacklist.includes(o.recipient?.username));
    orders.forEach((o) => Memory.blacklistedRooms.push(o.to));
}

export function generateEmpireResourceData(): EmpireResourceData {
    const roomsToCheck = Object.values(Game.rooms).filter((room) => room.controller?.my);
    let data: EmpireResourceData = { producers: {}, inventory: {} };

    roomsToCheck.forEach((room) => {
        if (data.producers[room.mineral.mineralType]) {
            data.producers[room.mineral.mineralType].push(room.name);
        } else {
            data.producers[room.mineral.mineralType] = [room.name];
        }

        if (room.storage) {
            Object.keys(room.storage.store).forEach((resource) => {
                if (data.inventory[resource]) {
                    data.inventory[resource] += room.storage.store[resource];
                } else {
                    data.inventory[resource] = room.storage.store[resource];
                }
            });
        }

        if (room.terminal) {
            Object.keys(room.terminal.store).forEach((resource) => {
                if (data.inventory[resource]) {
                    data.inventory[resource] += room.terminal.store[resource];
                } else {
                    data.inventory[resource] = room.terminal.store[resource];
                }
            });
        }
    });

    return data;
}

// adds shipment to Memory.shipments & returns reference id
export function addShipment(shipment: Shipment): ScreepsReturnCode {
    let nextId = 1;
    while (Memory.shipments[nextId]) {
        nextId++;
    }

    shipment.status = ShipmentStatus.QUEUED;
    Memory.shipments[nextId] = shipment;
    Memory.rooms[shipment.sender].shipments.push(nextId);

    if (shipment.requestId) {
        Memory.resourceRequests[shipment.requestId]?.shipments.push(nextId);
    }

    if (Memory.debug.logShipments)
        console.log(`${Game.time} - Shipment added to ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`);
    return OK;
}

export function getResourceAvailability(resource: ResourceConstant, roomToExclude?: string): number {
    const amount = Object.values(Game.rooms)
        .filter((room) => room.controller?.my && room.terminal?.isActive() && room.name !== roomToExclude)
        .reduce((sum, nextRoom) => sum + nextRoom.getResourceAmount(resource), 0);
    return amount;
}

export function addResourceRequest(roomName: string, resource: ResourceConstant, amount: number): number {
    if (getResourceAvailability(resource, roomName) < amount) {
        return -1;
    }

    let nextId = 1;
    while (Memory.resourceRequests[nextId]) {
        nextId++;
    }

    const request: ResourceRequest = {
        room: roomName,
        resource: resource,
        amount: amount,
        status: ResourceRequestStatus.SUBMITTED,
        shipments: [],
    };

    Memory.resourceRequests[nextId] = request;
    if (Memory.debug.logShipments) console.log(`${Game.time} - Request added for ${request.room} <- ${request.amount} ${request.resource}`);
    return nextId;
}
