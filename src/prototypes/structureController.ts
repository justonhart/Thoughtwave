Object.defineProperty(StructureController.prototype, 'ticksToDowngradeMax', {
    get: function (this: StructureController) {
        if (this.level === 0) {
            return undefined;
        } else if (this.level === 1) {
            return 20000;
        } else if (this.level === 2) {
            return 10000;
        } else if (this.level === 3) {
            return 20000;
        } else if (this.level === 4) {
            return 40000;
        } else if (this.level === 5) {
            return 80000;
        } else if (this.level === 6) {
            return 120000;
        } else if (this.level === 7) {
            return 150000;
        } else if (this.level === 8) {
            return 200000;
        }
    },
    enumerable: false,
    configurable: true,
});
