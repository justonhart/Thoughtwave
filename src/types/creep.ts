interface CreepMemory {
  room?: string;
  role: Role;
  _move?: Partial<TravelData>;
}

const enum Role {
  WORKER = 'Worker',
  BUILDER = 'Builder',
}
