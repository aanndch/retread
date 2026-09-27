import { db } from './db';
import { sortLegs } from './lib';
import {
  OSRM_DRIVING_BASE_URL,
  OSRM_FALLBACK_BASE_URL,
  SNAP_TIMEOUT_MS,
  SNAP_RETRIES,
  SNAP_RETRY_BACKOFF_MS,
} from './constants';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const OSRM_BASE_URLS = [OSRM_DRIVING_BASE_URL, OSRM_FALLBACK_BASE_URL];

export interface SnapOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  hosts?: string[];
}

/**
 * Snaps a leg's route along real roads via OSRM.
 * Passes all intermediate via points to anchor the route corridor along user-intended highways.
 * Falls back to straight line if offline or OSRM is unreachable.
 */
export async function snapLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  viaOrOptions?: { lat: number; lng: number }[] | SnapOptions,
  options?: SnapOptions
): Promise<{ lat: number; lng: number }[]> {
  const viaPoints = Array.isArray(viaOrOptions) ? viaOrOptions : undefined;
  const opts = Array.isArray(viaOrOptions) ? options : (viaOrOptions ?? options);
  const { timeoutMs = SNAP_TIMEOUT_MS, maxAttempts = SNAP_RETRIES, hosts = OSRM_BASE_URLS } = opts ?? {};

  const allPoints = [from, ...(viaPoints || []), to];

  // Safeguard: If endpoints are basically identical and no via points, return direct line
  if (!viaPoints?.length && haversineDistance(from, to) < 0.05) {
    return [from, to];
  }

  const coordString = allPoints.map((p) => `${p.lng},${p.lat}`).join(';');

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    for (const baseUrl of hosts) {
      let controller: AbortController | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const url = `${baseUrl}${coordString}?overview=full&geometries=geojson`;
        controller = new AbortController();
        timer = setTimeout(() => controller?.abort(), timeoutMs);
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          console.warn(`[OSRM] ${baseUrl} HTTP ${res.status}; trying next host.`);
          continue;
        }

        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          if (route.geometry && route.geometry.coordinates) {
            return route.geometry.coordinates.map((coord: [number, number]) => ({
              lat: coord[1],
              lng: coord[0],
            }));
          }
        }
        console.warn(`[OSRM] ${baseUrl} returned no usable route; trying next host.`);
      } catch (err) {
        console.warn(`[OSRM] attempt ${attempt + 1} ${baseUrl} failed: ${err}`);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    if (attempt < maxAttempts) await sleep(SNAP_RETRY_BACKOFF_MS * (attempt + 1));
  }

  // If multi-point query failed, try pairwise snapping across via points
  if (viaPoints?.length) {
    try {
      const segments: { lat: number; lng: number }[][] = [];
      for (let i = 0; i < allPoints.length - 1; i++) {
        segments.push(await snapLeg(allPoints[i], allPoints[i + 1], undefined, opts));
      }
      const joined: { lat: number; lng: number }[] = [];
      for (const seg of segments) {
        if (joined.length > 0 && seg.length > 0) joined.push(...seg.slice(1));
        else joined.push(...seg);
      }
      return joined;
    } catch {
      // Fall through to straight-line fallback
    }
  }

  console.warn('[OSRM] All hosts exhausted; returning straight-line fallback.');
  return allPoints;
}

/**
 * Backfills missing road paths for all legs of a ride.
 */
export async function backfillRideRoutes(rideId: number): Promise<void> {
  const legs = await db.legs.where('rideId').equals(rideId).toArray();
  const sortedLegs = sortLegs(legs);

  const rideRecord = await db.rides.get(rideId);

  let lastKnownGps: { lat: number; lng: number } | null =
    rideRecord?.startLocation?.kind === 'gps'
      ? { lat: rideRecord.startLocation.lat, lng: rideRecord.startLocation.lng }
      : null;

  for (const currentLeg of sortedLegs) {
    if (currentLeg.location?.kind !== 'gps') {
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
      continue;
    }

    const toGps = { lat: currentLeg.location.lat, lng: currentLeg.location.lng };

    if (!lastKnownGps) {
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
      lastKnownGps = toGps;
      continue;
    }

    const fromGps = lastKnownGps;

    const needsSnap =
      !currentLeg.roadPath ||
      currentLeg.roadPath.length <= 2 ||
      haversineDistance(currentLeg.roadPath[0], fromGps) > 0.05 ||
      haversineDistance(currentLeg.roadPath[currentLeg.roadPath.length - 1], toGps) > 0.05;

    if (needsSnap) {
      try {
        const snappedPath = await snapLeg(fromGps, toGps, currentLeg.viaPoints);
        await db.legs.update(currentLeg.id!, { roadPath: snappedPath });
      } catch (snapErr) {
        console.warn(`[OSRM] Snap failed for leg, saving straight line fallback:`, snapErr);
        await db.legs.update(currentLeg.id!, { roadPath: [fromGps, ...(currentLeg.viaPoints || []), toGps] });
      }
    }

    lastKnownGps = toGps;
  }
}
