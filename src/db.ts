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
  }
}

export const db = new RetreadDatabase();
