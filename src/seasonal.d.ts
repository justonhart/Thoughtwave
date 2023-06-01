declare const RESOURCE_THORIUM: RESOURCE_THORIUM;
<<<<<<< HEAD
type RESOURCE_THORIUM = "thorium";
=======
type RESOURCE_THORIUM = "T";

declare const FIND_REACTORS: 10051;
>>>>>>> 80849bbaf65e671db63f5a3095b09c2da9f4e872

interface Reactor {
    continuousWork: number;
    store: GenericStore;
    my: boolean;
    owner: {username: string}; 
}