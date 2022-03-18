interface CreepMemory {
  role: Role;
  _move?: Partial<TravelData>;
}

const enum Role {
  HARVESTER = 'Harvester',
  BUILDER = 'Builder',
}
