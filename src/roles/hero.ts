export class Hero extends PowerCreep {
    public run(): void {
        this.initMemory();

        let target = Game.getObjectById(this.memory.targetId) as Structure;
        if (this.shouldRenew()) {
            this.renewCreep(target);
        } else if (!this.room.controller.isPowerEnabled) {
            this.enableCurrentRoom(target);
        } else if (this.store.getUsedCapacity() > this.store.getCapacity() / 1.2) {
            this.storeExtraOps(target);
        } else {
            // Passive Powers (should always run but with lower priority than active ones)
            this.generateOps();
            this.boostSource(target);
        }

        target = Game.getObjectById(this.memory.targetId) as Structure;
        // Travel to target
        if (target) {
            this.travelTo(target, {
                range: target instanceof StructurePowerSpawn || target instanceof StructureController || target instanceof StructureStorage ? 1 : 3,
            });
        }
    }

    /**
     * Initialize powerCreep memory
     */
    private initMemory(): void {
        if (!this.memory.cooldown) {
            this.memory.cooldown = {};
        }
    }

    /**
     * Enable powerCreep's powers in current room
     */
    private enableCurrentRoom(target: Structure): void {
        if (!(target instanceof StructureController)) {
            this.memory.targetId = this.room.controller.id;
            return;
        }

        if (this.pos.isNearTo(target)) {
            this.enableRoom(this.room.controller);
            delete this.memory.targetId;
        }
    }

    /**
     * Renew powerCreeps TTL at powerSpawn
     */
    private renewCreep(target: Structure): void {
        if (!(target instanceof StructurePowerSpawn)) {
            this.memory.targetId = this.room.powerSpawn.id;
            return;
        }

        if (this.pos.isNearTo(target)) {
            this.renew(target);
            delete this.memory.targetId;
        }
    }

    /**
     * When PowerCreep is about to die, check if it should renew or respawn in different room.
     * To avoid constantly having 8 hours wait time, the difference between the resource energy has to be high enough to warrant a respawn.
     * @param powerCreep
     */
    private shouldRenew(): boolean {
        // TODO: check if creep should die instead because other rooms need energy (should be critical ==> should just be able to check powerCreep Queue in memory)
        // TODO: moveTo new room instead of suicide?
        return this.ticksToLive < 100;
    }

    /**
     * Boost the source. Should start boosting once ticks remaining is below 40 to avoid having the effect fall off.
     * Sets a cooldown to avoid checking every tick.
     */
    private boostSource(target: Structure) {
        this.initPowerCooldown(PWR_REGEN_SOURCE);
        if (target instanceof Source && this.pos.getRangeTo(target) <= 3) {
            this.usePower(PWR_REGEN_SOURCE, target);
            this.memory.cooldown[PWR_REGEN_SOURCE] = Game.time + POWER_INFO[PWR_REGEN_SOURCE].cooldown;
            delete this.memory.targetId;
        } else if (!target && this.memory.cooldown[PWR_REGEN_SOURCE] < Game.time) {
            const sources = this.room.find(FIND_SOURCES);
            const targetSource = sources.find(
                (source: Source) => !source.effects?.some((effect) => effect.effect === PWR_REGEN_SOURCE && effect.ticksRemaining > 40)
            );
            if (targetSource) {
                this.memory.targetId = targetSource.id;
            } else {
                const lowestSourceCooldown = sources.reduce((lowestCooldown, nextSource) => {
                    const nextSourceTicks = nextSource.effects.find((effect) => effect.effect === PWR_REGEN_SOURCE)?.ticksRemaining - 39;
                    return nextSourceTicks < lowestCooldown ? nextSourceTicks : lowestCooldown;
                }, 0);
                this.memory.cooldown[PWR_REGEN_SOURCE] = Game.time + lowestSourceCooldown;
            }
        }
    }

    /**
     * Generate Ops whenever possible.
     */
    private generateOps() {
        this.initPowerCooldown(PWR_GENERATE_OPS);
        if (this.memory.cooldown[PWR_GENERATE_OPS] < Game.time) {
            this.usePower(PWR_GENERATE_OPS);
            this.memory.cooldown[PWR_GENERATE_OPS] = Game.time + POWER_INFO[PWR_GENERATE_OPS].cooldown;
        }
    }

    /**
     * Empty out all ops from powerCreep.
     */
    private storeExtraOps(target: Structure) {
        if (!(target instanceof StructureStorage)) {
            this.memory.targetId = this.room.storage.id;
            return;
        }

        if (this.pos.isNearTo(target)) {
            this.transfer(target, RESOURCE_OPS);
            delete this.memory.targetId;
        }
    }

    /**
     * Initialize cooldown memory for specified power
     * @param powerKey
     */
    private initPowerCooldown(powerKey: number) {
        if (!this.memory.cooldown[powerKey]) {
            const power = this.powers[powerKey];
            if (power?.level) {
                this.memory.cooldown[powerKey] = Game.time + power?.cooldown ?? 0;
            }
        }
    }

    /**
     * Boost spawn timer.
     */
    private boostSpawn(target: Structure) {
        this.initPowerCooldown(PWR_OPERATE_SPAWN);
        if (!target && this.store.ops < POWER_INFO[PWR_OPERATE_SPAWN].ops) {
            this.memory.targetId = this.room.storage.id;
        } else if (target instanceof StructureStorage && this.pos.isNearTo(target)) {
            this.withdraw(this.room.storage, RESOURCE_OPS, 300);
            delete this.memory.targetId;
        } else if (!target && this.memory.cooldown[PWR_OPERATE_SPAWN] < Game.time) {
            const spawns = this.room.find(FIND_MY_SPAWNS);
            const targetSpawn = spawns.find(
                (spawn) => !spawn.effects?.some((effect) => effect.effect === PWR_OPERATE_SPAWN && effect.ticksRemaining > 20)
            );
            if (targetSpawn) {
                this.memory.targetId = targetSpawn.id;
            } else {
                const lowestSpawnCooldown = spawns.reduce((lowestCooldown, nextSpawn) => {
                    const nextSpawnTicks = nextSpawn.effects.find((effect) => effect.effect === PWR_OPERATE_SPAWN)?.ticksRemaining - 19;
                    return nextSpawnTicks < lowestCooldown ? nextSpawnTicks : lowestCooldown;
                }, 0);
                this.memory.cooldown[PWR_OPERATE_SPAWN] = Game.time + lowestSpawnCooldown;
            }
        } else if (target instanceof StructureSpawn && this.pos.getRangeTo(target) <= 3) {
            this.usePower(PWR_OPERATE_SPAWN, target);
            this.memory.cooldown[PWR_OPERATE_SPAWN] = Game.time + POWER_INFO[PWR_OPERATE_SPAWN].cooldown;
            delete this.memory.targetId;
        }
    }
}
