export type DistanceMode = 'auto' | 'manual' | 'odo';
export type EditorMode = 'new-ride' | 'edit-ride' | 'new-leg' | 'edit';

export interface Ride {
  id?: number;
  title: string;
  createdAt: string; // ISO String
  startLocation?: LocationUnion | null; // Departure pin
  distanceMode?: DistanceMode; // Preferred distance logging style
  startOdo?: number | null; // Starting odometer reading (only for odo mode)
}

export type LocationUnion =
  | { kind: 'gps'; lat: number; lng: number; name?: string }
  | { kind: 'named'; name: string };

export interface Leg {
  id?: number;
  rideId: number;
  date: string;               // YYYY-MM-DD
  time?: string;              // HH:MM (24-hour)
  note: string;               // Freeform textarea content
  photos: Blob[];             // Compressed photo blobs
  photoThumbs?: Blob[];       // Small JPEGs (~320px) for ride-card covers
  km?: number | null;         // Direct distance entry
  odo?: number | null;        // Odometer entry
  location?: LocationUnion | null;
  roadPath?: { lat: number; lng: number }[] | null; // OSRM shape coordinates
  title?: string;
}
