export interface Trip {
  id?: number;
  title: string;
  createdAt: string; // ISO String
}

export type LocationUnion =
  | { kind: 'gps'; lat: number; lng: number; name?: string }
  | { kind: 'named'; name: string };

export interface Page {
  id?: number;
  tripId: number;
  date: string;               // YYYY-MM-DD
  note: string;               // Freeform textarea content
  photos: Blob[];             // Compressed photo blobs
  km?: number | null;         // Direct distance entry
  odo?: number | null;        // Odometer entry
  location?: LocationUnion | null;
  roadPath?: { lat: number; lng: number }[] | null; // OSRM shape coordinates
  title?: string;
}
