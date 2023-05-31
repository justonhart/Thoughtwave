declare const RESOURCE_THORIUM: RESOURCE_THORIUM;
type RESOURCE_THORIUM = "thorium";

interface Reactor {
    continuousWork: number;
    store: GenericStore;
    my: boolean;
    owner: {username: string}; 
}