import { EarlyMaintainer } from './earlyMaintainer';

export class EarlyBuilder extends EarlyMaintainer {
    protected findTarget(): Id<Structure> | Id<ConstructionSite> {
        let constructedDefenses = this.pos
            .findInRange(FIND_STRUCTURES, 3)
            .filter(
                (structure) => (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) && structure.hits === 1
            );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        let constructionSites = this.homeroom.find(FIND_MY_CONSTRUCTION_SITES);

        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((mostProgressedSite, thisSite) =>
                mostProgressedSite.progress / mostProgressedSite.progressTotal > thisSite.progress / thisSite.progressTotal
                    ? mostProgressedSite
                    : thisSite
            ).id;
        }

        let damagedStructures = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                // @ts-ignore
                ![STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < structure.hitsMax
        );
        if (damagedStructures.length) {
            //find the lowest health ratio
            let lowestRatio = Math.min(...damagedStructures.map((structure) => structure.hits / structure.hitsMax));

            //take only those with the lowest ratio and find the closest target among them
            let mostDamagedStructures = damagedStructures.filter((structure) => structure.hits / structure.hitsMax === lowestRatio);
            return this.pos.findClosestByPath(mostDamagedStructures, { range: 3, ignoreCreeps: true }).id;
        }

        let defenses = this.homeroom.find(FIND_STRUCTURES).filter(
            (structure) =>
                //@ts-ignore
                [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < this.getDefenseHitpointTarget()
        );
        if (defenses.length) {
            return this.pos.findClosestByPath(defenses, { range: 3, ignoreCreeps: true }).id;
        }

        if (this.homeroom.storage?.my) {
            return this.homeroom.storage.id;
        }

        return this.homeroom.controller?.id;
    }
}
