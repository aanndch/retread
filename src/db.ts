import Dexie, { type Table } from 'dexie';
import type { Trip, Page } from './types';

export class RetreadDatabase extends Dexie {
  trips!: Table<Trip>;
  pages!: Table<Page>;

  constructor() {
    super('RetreadDatabase');
    this.version(1).stores({
      trips: '++id, createdAt',
      pages: '++id, tripId, date' // Indexes for fast lookups
    });
  }
}

export const db = new RetreadDatabase();
