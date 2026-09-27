import { db } from './db';
import { sortLegs } from './lib';

// Compute Haversine distance in kilometers between two GPS points
export function haversineDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371; // Earth radius in km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface SnapOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  hosts?: string[];
}

/**
 * Creates the field-logbook route line connecting the start, via points, and destination.
 * Purely local, instant, and 100% offline — no external routing servers or unpredictable detours.
 */
export async function snapLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  viaOrOptions?: { lat: number; lng: number }[] | SnapOptions,
  _options?: SnapOptions
): Promise<{ lat: number; lng: number }[]> {
  const viaPoints = Array.isArray(viaOrOptions) ? viaOrOptions : undefined;
  return [from, ...(viaPoints || []), to];
}

/**
 * Backfills route paths for all legs of a ride.
 * In field-logbook mode, connects pins directly through user-defined via points.
 */
export async function backfillRideRoutes(rideId: number): Promise<void> {
  const legs = await db.legs.where('rideId').equals(rideId).toArray();
  const sortedLegs = sortLegs(legs);

  const rideRecord = await db.rides.get(rideId);

  // Last known GPS anchor; advances only through pinned legs.
  let lastKnownGps: { lat: number; lng: number } | null =
    rideRecord?.startLocation?.kind === 'gps'
      ? { lat: rideRecord.startLocation.lat, lng: rideRecord.startLocation.lng }
      : null;

  for (const currentLeg of sortedLegs) {
    // Pin-less leg (named or nothing): nothing to snap. Clear any stale path
    if (currentLeg.location?.kind !== 'gps') {
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
      continue;
    }

    const toGps = { lat: currentLeg.location.lat, lng: currentLeg.location.lng };

    // First GPS anchor in the ride (no departure pin): establish it
    if (!lastKnownGps) {
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
      lastKnownGps = toGps;
      continue;
    }

    const fromGps = lastKnownGps;
    const path = await snapLeg(fromGps, toGps, currentLeg.viaPoints);
    await db.legs.update(currentLeg.id!, { roadPath: path });

    lastKnownGps = toGps;
  }
}
