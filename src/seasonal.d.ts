declare const RESOURCE_THORIUM: RESOURCE_THORIUM;
type RESOURCE_THORIUM = "T";

declare const FIND_REACTORS: 10051;

interface Reactor extends RoomObject {
    continuousWork: number;
    store: GenericStore;
    my: boolean;
    owner: {username: string}; 
}