import { Maintainer } from './maintainer';

export class Builder extends Maintainer {
    protected findTarget(): Id<Structure> | Id<ConstructionSite> {
        let constructedDefenses = this.pos
            .findInRange(FIND_STRUCTURES, 3)
            .filter(
                (structure) => (structure.structureType === STRUCTURE_RAMPART || structure.structureType === STRUCTURE_WALL) && structure.hits <= 1000
            );
        if (constructedDefenses.length) {
            return constructedDefenses.shift().id;
        }

        let constructionSites = this.room.find(FIND_MY_CONSTRUCTION_SITES);
        if (constructionSites.length) {
            //return the most-progressed construction site, proportionally
            return constructionSites.reduce((mostProgressedSite, siteToCheck) =>
                mostProgressedSite.progress / mostProgressedSite.progressTotal > siteToCheck.progress / siteToCheck.progressTotal
                    ? mostProgressedSite
                    : siteToCheck
            ).id;
        }

        let repairTarget = this.room.getRepairTarget();
        if (repairTarget) {
            return repairTarget;
        }

        let defenses = this.room.find(FIND_STRUCTURES).filter(
            (structure) =>
                //@ts-ignore
                [STRUCTURE_WALL, STRUCTURE_RAMPART].includes(structure.structureType) && structure.hits < this.getDefenseHitpointTarget()
        );
        if (defenses.length) {
            return defenses.reduce((weakest, defToCompare) => (weakest.hits < defToCompare.hits ? weakest : defToCompare)).id;
        }

        return this.room.controller?.id;
    }
}
