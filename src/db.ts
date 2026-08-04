import Dexie, { type Table } from 'dexie';
import type { Ride, Leg } from './types';

export class RetreadDatabase extends Dexie {
  rides!: Table<Ride>;
  legs!: Table<Leg>;

  constructor() {
    super('RetreadDatabase');
    this.version(1).stores({
      trips: '++id, createdAt',
      pages: '++id, tripId, date'
    });
    this.version(2).stores({
      trips: null,
      pages: null,
      rides: '++id, createdAt',
      legs: '++id, rideId, date' // Indexes for fast lookups
    });
    // v3: no index changes. Non-indexed additions (e.g. Leg.photoThumbs,
    // Leg.title, Leg.time) don't need a store migration; this bump exists so
    // future index changes have a clean upgrade anchor and any .upgrade()
    // data backfill can slot in here.
    this.version(3).stores({
      rides: '++id, createdAt',
      legs: '++id, rideId, date'
    });
  }
}

export const db = new RetreadDatabase();
