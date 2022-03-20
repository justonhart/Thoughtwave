interface CreepMemory {
  targetId?: Id<Structure> | Id<ConstructionSite>;
  miningPos?: string;
  gathering?: boolean;
  room?: string;
  role?: Role;
  _move?: Partial<TravelData>;
}

const enum Role {
  WORKER = 'Worker',
  BUILDER = 'Builder',
}
