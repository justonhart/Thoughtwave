const RESOURCE_COMPRESSION_MAP = {
    [RESOURCE_UTRIUM]: RESOURCE_UTRIUM_BAR,
    [RESOURCE_LEMERGIUM]: RESOURCE_LEMERGIUM_BAR,
    [RESOURCE_ZYNTHIUM]: RESOURCE_ZYNTHIUM_BAR,
    [RESOURCE_KEANIUM]: RESOURCE_KEANIUM_BAR,
    [RESOURCE_GHODIUM]: RESOURCE_GHODIUM_MELT,
    [RESOURCE_OXYGEN]: RESOURCE_OXIDANT,
    [RESOURCE_HYDROGEN]: RESOURCE_REDUCTANT,
    [RESOURCE_CATALYST]: RESOURCE_PURIFIER,
    [RESOURCE_ENERGY]: RESOURCE_BATTERY,
};

export function manageEmpireResources() {
    let terminalRooms = Object.values(Game.rooms).filter((room) => room.controller?.my && room.terminal?.isActive() && !room.memory.abandon);

    //distribute energy throughout empire
    if (Game.time % 25 === 0) {
        const roomEnergyMap = terminalRooms.map((room) => ({
            roomName: room.name,
            energy: room.getResourceAmount(RESOURCE_ENERGY) + room.getIncomingResourceAmount(RESOURCE_ENERGY),
            batteries: room.getResourceAmount(RESOURCE_BATTERY) + room.getIncomingResourceAmount(RESOURCE_BATTERY),
            hasFactory: room.factory?.isActive(),
        }));
        let shipments: Shipment[] = [];

        const roomsWithExtraEnergy = roomEnergyMap.filter(
            (room) =>
                room.energy >= 300000 &&
                !Memory.rooms[room.roomName].shipments.some(
                    (id) => Memory.shipments[id]?.resource === RESOURCE_ENERGY || Memory.shipments[id]?.resource === RESOURCE_BATTERY
                )
        );

        roomsWithExtraEnergy.forEach((sender) => {
            let recipient = roomEnergyMap.find(
                (otherRoom) =>
                    Game.rooms[otherRoom.roomName]?.canSpawn() &&
                    sender.energy > 150000 + otherRoom.energy + 10 * otherRoom.batteries &&
                    !shipments.some((s) => s.recipient === otherRoom.roomName)
            );
            if (recipient) {
                //if there are batteries to send, use those instead
                if (sender.batteries && recipient.hasFactory) {
                    const shipment: Shipment = {
                        sender: sender.roomName,
                        recipient: recipient.roomName,
                        resource: RESOURCE_BATTERY,
                        amount: Math.min(sender.batteries, 5000),
                    };
                    shipments.push(shipment);
                } else {
                    const shipment: Shipment = {
                        sender: sender.roomName,
                        recipient: recipient.roomName,
                        resource: RESOURCE_ENERGY,
                        amount: calculateEnergyToSend(sender.roomName, recipient.roomName),
                    };
                    shipments.push(shipment);
                }
            }
        });

        shipments.forEach((shipment) => {
            let result = addShipment(shipment);
            if (result !== OK) {
                console.log(
                    `${Game.time} - Error adding shipment: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`
                );
            }
        });
    }

    //check shipments for invalids - shipments from/to disabled rooms
    Object.entries(Memory.shipments).forEach(([shipmentId, shipment]) => {
        const isInvalid = !Game.rooms[shipment.sender]?.terminal || !Game.rooms[shipment.sender]?.canSpawn();
        if (isInvalid) {
            delete Memory.shipments[shipmentId];
        }
    });

    //manage resource requests - if rooms have this resource, they should send it regardless of how much they have
    Object.entries(Memory.resourceRequests).forEach(([requestId, request]) => {
        //first check that resource requests can still be completed - failcases = Terminal destroyed, room captured
        const requestUndeliverable = !Game.rooms[request.room] || !Game.rooms[request.room].canSpawn();
        if (requestUndeliverable) {
            request.status = ResourceRequestStatus.FAILED;
        }
        switch (request.status) {
            case ResourceRequestStatus.SUBMITTED:
                const suppliers = terminalRooms
                    .map((room) => ({
                        roomName: room.name,
                        amount: room.getResourceAmount(request.resource) - room.getOutgoingResourceAmount(request.resource),
                    }))
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
                        let result = addShipment(shipment);
                        if (result !== OK) {
                            console.log(
                                `${Game.time} - Error adding shipment: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`
                            );
                        } else {
                            amountCommitted += suppliers[i].amount;
                        }
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
                    Memory.resourceRequests[requestId].status = ResourceRequestStatus.FULFILLED;
                } else if (request.shipments.some((id) => !Memory.shipments[id] || Memory.shipments[id].status === ShipmentStatus.FAILED)) {
                    Memory.resourceRequests[requestId].shipments = request.shipments.filter(
                        (id) => Memory.shipments[id] && Memory.shipments[id].status !== ShipmentStatus.FAILED
                    );
                    Memory.resourceRequests[requestId].status = ResourceRequestStatus.SUBMITTED;
                }
                break;
            case ResourceRequestStatus.FAILED:
                console.log(`${Game.time} - Resource request failed: ${request.room} - ${request.resource}`);
                delete Memory.resourceRequests[requestId];
                break;
            case ResourceRequestStatus.FULFILLED:
                if (Memory.debug.logShipments)
                    console.log(`${Game.time} - Request fulfilled: ${request.amount} ${request.resource} for ${request.room}`);
                request.shipments.forEach((id) => delete Memory.shipments[id]);
                delete Memory.resourceRequests[requestId];
                break;
        }
    });

    //identify resource needs and distribute extra - 20k of each tier 3 boost per room, 5k of every other mineral + compound
    terminalRooms
        .filter((room) => room.energyStatus >= EnergyStatus.STABLE && room.memory.shipments.length < 3)
        .forEach((room) => {
            const extraResources = getExtraResources(room);
            extraResources.forEach((extraResource) => {
                const roomsNeedingResource = global.resourceNeeds[extraResource.resource]?.filter(
                    (need) =>
                        !Object.values(Memory.shipments).some(
                            (shipment) => shipment.resource === extraResource.resource && shipment.recipient === need.roomName
                        )
                );
                const excessAmount = extraResource.amount;

                if (roomsNeedingResource?.length) {
                    const roomToSupply = findClosestRecipient(room, roomsNeedingResource);
                    if (roomToSupply) {
                        let shipment: Shipment;
                        if (room.getCompressedResourceAmount(extraResource.resource) && Game.rooms[roomToSupply.roomName].factory) {
                            const amountOfCompressedToSend = Math.min(
                                room.getResourceAmount(RESOURCE_COMPRESSION_MAP[extraResource.resource]),
                                Math.floor(Math.ceil(roomToSupply.amount / 500)) * 100
                            );
                            shipment = {
                                sender: room.name,
                                resource: RESOURCE_COMPRESSION_MAP[extraResource.resource],
                                amount: amountOfCompressedToSend,
                                recipient: roomToSupply.roomName,
                            };
                        } else {
                            const amountToSend = Math.min(excessAmount, roomToSupply.amount);
                            shipment = {
                                sender: room.name,
                                resource: extraResource.resource,
                                amount: amountToSend,
                                recipient: roomToSupply.roomName,
                            };
                        }

                        let result = addShipment(shipment);
                        if (result !== OK) {
                            console.log(
                                `${Game.time} - Error adding shipment: ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`
                            );
                        }
                    }
                }
            });
        });

    //Manage shipments not associated to requests - those are handled with requests
    Object.entries(Memory.shipments)
        .filter(([shipmentId, shipment]) => !shipment.requestId)
        .forEach(([shipmentId, shipment]) => {
            if (shipment.status === ShipmentStatus.SHIPPED && !shipment.requestId) {
                delete Memory.shipments[shipmentId];
            } else if (shipment.status === ShipmentStatus.FAILED) {
                console.log(`${Game.time} - Shipment failed: ${shipment.recipient} - ${shipment.resource}`);
                delete Memory.shipments[shipmentId];
            }
        });
}

function findClosestRecipient(sender: Room, recipients: any[]): { roomName: string; amount: number } {
    let distanceMap = recipients.map((need) => {
        return { name: need.roomName, amount: need.amount, distance: Game.map.getRoomLinearDistance(sender.name, need.roomName) };
    });
    let closest = distanceMap.reduce((closestSoFar, next) => (closestSoFar.distance < next.distance ? closestSoFar : next));
    return { roomName: closest.name, amount: closest.amount };
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
        const inboundResources = room.getIncomingResourceAmount(resource);
        const inboundCompressedResources =
            (Object.keys(RESOURCE_COMPRESSION_MAP).includes(resource) ? room.getIncomingResourceAmount(RESOURCE_COMPRESSION_MAP[resource]) : 0) * 5;
        let need =
            (resource.charAt(0) === 'X' && resource.length > 1 ? 20000 : 5000) -
            (room.getResourceAmount(resource) + room.getCompressedResourceAmount(resource) + inboundCompressedResources + inboundResources);
        if (need > 0 && room.memory.factoryTask?.product !== resource) {
            needs.push({ resource: resource, amount: need });
        }
    });

    return needs;
}

export function getAllRoomNeeds(): { [resource: string]: { roomName: string; amount: number }[] } {
    let needs = {};

    Object.values(Game.rooms)
        .filter((room) => room.controller?.my && room.canSpawn() && room.terminal?.isActive())
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
        const amountExtra =
            room.getResourceAmount(resource) +
            room.getCompressedResourceAmount(resource) -
            room.getOutgoingResourceAmount(resource) -
            (Object.keys(RESOURCE_COMPRESSION_MAP).includes(resource) ? room.getOutgoingResourceAmount(RESOURCE_COMPRESSION_MAP[resource]) : 0) -
            maxResourceAmount;

        //don't return very small amounts - wait for reasonable amounts to ship
        if (amountExtra > 1000) {
            extraResources.push({ resource: resource, amount: amountExtra });
        }
    });

    return extraResources;
}

export function shipmentReady(terminal: StructureTerminal, shipmentId: number): boolean {
    const shipment = Memory.shipments[shipmentId];
    const isIncomingMarketOrder = shipment.recipient === shipment.sender && shipment.marketOrderId;
    let energyNeeded = isIncomingMarketOrder
        ? Game.market.calcTransactionCost(shipment.amount, terminal.room.name, Game.market.getOrderById(shipment.marketOrderId).roomName)
        : Game.market.calcTransactionCost(shipment.amount, terminal.room.name, shipment.recipient) +
          (shipment.resource === RESOURCE_ENERGY ? shipment.amount : 0);

    return isIncomingMarketOrder
        ? terminal.store.energy >= energyNeeded
        : terminal.store[shipment.resource] >= shipment.amount && terminal.store.energy >= energyNeeded;
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
    if (!(shipment.amount > 0)) {
        return ERR_INVALID_ARGS;
    }

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

    if (shipment.recipient === shipment.sender && shipment.marketOrderId) {
        console.log(`${Game.time} - Market order ${shipment.marketOrderId} added: ${shipment.amount} ${shipment.resource} -> ${shipment.recipient}`);
    } else {
        console.log(`${Game.time} - Shipment added to ${shipment.sender} -> ${shipment.amount} ${shipment.resource} to ${shipment.recipient}`);
    }
    return OK;
}

export function getResourceAvailability(resource: ResourceConstant, roomToExclude?: string): number {
    const amount = Object.values(Game.rooms)
        .filter((room) => room.controller?.my && room.terminal?.isActive() && room.name !== roomToExclude)
        .reduce(
            (sum, nextRoom) =>
                sum +
                nextRoom.getResourceAmount(resource) +
                nextRoom.getCompressedResourceAmount(resource) -
                nextRoom.getOutgoingResourceAmount(resource) -
                (Object.keys(RESOURCE_COMPRESSION_MAP).includes(resource)
                    ? nextRoom.getOutgoingResourceAmount(RESOURCE_COMPRESSION_MAP[resource])
                    : 0),
            0
        );
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

//special shipment case - add enough energy to purchase resource from market, but don't send.
export function addMarketOrder(roomName: string, marketId: string, amount: number): ScreepsReturnCode {
    const order = Game.market.getOrderById(marketId);
    const shipmentToAdd: Shipment = {
        sender: roomName,
        recipient: roomName,
        resource: order.resourceType as ResourceConstant,
        marketOrderId: marketId,
        amount: amount,
    };

    return addShipment(shipmentToAdd);
}
