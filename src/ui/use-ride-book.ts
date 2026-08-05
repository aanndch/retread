import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { computeTotalDistance, formatDateRange, buildStopTrail } from '../lib';
import type { Ride, Leg } from '../types';

// Sentinel month key for rides that have no legs yet (undated drafts).
export const DRAFT_MONTH_KEY = '__drafts';

export interface HomeRideEntry {
  ride: Ride;
  totalKm: number;
  firstPhotoBlob: Blob | null;
  coverKey: string;
  dateRange: string;
  stopTrail: string;
  monthKey: string;
  startDate: string;
  legs: Leg[];
}

// Object URLs for ride cover images, cached by the cover slot (leg + photo
// index). Live-query re-emits hand back fresh Blob references for identical
// bytes, so without this the cover would re-decode and flicker on every emit.
export const coverUrlCache = new Map<string, { blob: Blob; url: string }>();

// Content fingerprint of the displayed cover blob, used in the cache key so a
// changed cover (or changed first photo) busts the cached object URL while
// identical bytes keep hitting the cache and don't flicker.
async function blobFingerprint(blob: Blob): Promise<string> {
  try {
    if (crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to size/type below
  }
  return `${blob.size}:${blob.type}`;
}

// Shared ride-book query: every ride + its legs, with cover, trail, and month
// bucket. Lives above the router so both the home page and the global search
// overlay can read the same live data.
export function useRideBook(): HomeRideEntry[] | undefined {
  return useLiveQuery(async () => {
    const allRides = await db.rides.orderBy('createdAt').reverse().toArray();
    const allLegs = await db.legs.toArray();
    const legsByRide = new Map<number, typeof allLegs>();
    for (const leg of allLegs) {
      const list = legsByRide.get(leg.rideId) || [];
      list.push(leg);
      legsByRide.set(leg.rideId, list);
    }

    const list: HomeRideEntry[] = [];

    for (const ride of allRides) {
      const legs = legsByRide.get(ride.id!) || [];

      const sortedLegs = [...legs].sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        const tA = a.time || '00:00';
        const tB = b.time || '00:00';
        return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
      });

      const legWithPhoto = sortedLegs.find(l => l.photos && l.photos.length > 0);
      const customCover = ride.coverBlob ? ride.coverBlob : null;
      const firstPhotoBlob = customCover
        ? customCover
        : legWithPhoto
          ? (legWithPhoto.photoThumbs && legWithPhoto.photoThumbs.length > 0
              ? legWithPhoto.photoThumbs[0]
              : legWithPhoto.photos[0])
          : null;
      const coverFingerprint = firstPhotoBlob ? await blobFingerprint(firstPhotoBlob) : '';
      const coverKey = firstPhotoBlob
        ? customCover
          ? `${ride.id}:cover:${coverFingerprint}`
          : `${legWithPhoto!.id}:0:${coverFingerprint}`
        : '';

      let dateRange = '';
      if (sortedLegs.length > 0) {
        dateRange = formatDateRange(
          sortedLegs[0].date,
          sortedLegs[sortedLegs.length - 1].date
        );
      }

      const stopTrail = buildStopTrail(ride.startLocation, sortedLegs);

      const startDate = sortedLegs.length > 0 ? sortedLegs[0].date : '';
      const monthKey = startDate ? startDate.slice(0, 7) : DRAFT_MONTH_KEY;

      list.push({
        ride,
        totalKm: computeTotalDistance(legs),
        firstPhotoBlob,
        coverKey,
        dateRange,
        stopTrail,
        monthKey,
        startDate,
        legs: sortedLegs
      });
    }

    return list;
  });
}
