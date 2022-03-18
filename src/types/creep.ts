interface CreepMemory {
  role: Role;
  _move: Partial<TravelData>;
}

enum Role {
  HARVESTER = 'Harvester',
  BUILDER = 'Builder',
}
