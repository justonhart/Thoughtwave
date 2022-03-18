interface TravelData {
  dest: Destination;
  time: number;
  path: string;
  room: string;
}

interface Destination {
  x: number;
  y: number;
  room: string;
}
