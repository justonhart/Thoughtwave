declare global {
    //map of resources to rooms which need it
    var resourceNeeds: { [resource: string]: { roomName: string; amount: number }[] };

    //global values shared among rooms - only one room should check constructions per tick
    var roomConstructionsChecked: boolean;

    //key is made out of roomName + orientation + anchor
    var quadMatrix: { [key: string]: CustomMatrixCost[] };

    var duoMatrix: { [key: string]: CustomMatrixCost[] };

    //resource maps to first qualifying purchase order
    var qualifyingMarketOrders: { [resource: string]: string };

    var nextTickFunctions: (() => void)[];

    var identifierIncrement: number;

    var remoteSourcesChecked: boolean;

    var initiatingPowerCreeps: boolean;

    var empireData: EmpireData;
}

export {};
