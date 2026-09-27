import { db } from './db';
import { sortLegs } from './lib';
import { 
  SNAP_THRESHOLD_KM, 
  OSRM_DRIVING_BASE_URL, 
  OSRM_FALLBACK_BASE_URL,
  SNAP_TIMEOUT_MS,
  SNAP_RETRIES,
  SNAP_RETRY_BACKOFF_MS,
  LONG_LEG_SPLIT_KM,
  DIRECT_DIST_LIMIT_KM, 
  DETOUR_RATIO_LONG, 
  DETOUR_FLAT_SHORT_KM 
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

// OSRM hosts tried in order per attempt. The fallback mirror keeps snapping
// alive when the primary public router is overloaded or rate-limited.
const OSRM_BASE_URLS = [OSRM_DRIVING_BASE_URL, OSRM_FALLBACK_BASE_URL];

// Great-circle chord interpolation: split a long leg into waypoints so each
// hop stays short enough for public OSRM servers to answer without timing out.
function interpolateWaypoints(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  count: number
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    pts.push({
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    });
  }
  return pts;
}

// Query OSRM Routing API for a single leg between from and to coords.
// Resilient: times out, retries across hosts, and splits very long legs into
// hops. Never throws — a straight-line [from, to] is returned on total failure
// so maps always render something.
// Options allow callers to tighten the budget (e.g. live auto-fill in the
// editor must never hang) while the default keeps full resilience for the
// background backfill.
export interface SnapOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  hosts?: string[];
}

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
  const directDist = haversineDistance(from, to);

  // Safeguard: If points are basically identical and no via points, return direct line
  if (!viaPoints?.length && directDist < SNAP_THRESHOLD_KM) {
    return [from, to];
  }

  // If there are no via points and distance is huge, split marathon legs into hops.
  // When via points ARE present, the user has explicitly guided the corridor,
  // so we avoid blind geometric straight-line midpoint splitting.
  if (!viaPoints?.length) {
    const hopCount = Math.max(1, Math.ceil(directDist / LONG_LEG_SPLIT_KM));
    if (hopCount > 1) {
      const waypoints = [from, ...interpolateWaypoints(from, to, hopCount - 1), to];
      const segments: { lat: number; lng: number }[][] = [];
      for (let i = 0; i < waypoints.length - 1; i++) {
        segments.push(await snapLeg(waypoints[i], waypoints[i + 1], undefined, opts));
      }
      const joined: { lat: number; lng: number }[] = [];
      for (const seg of segments) {
        if (joined.length > 0 && seg.length > 0) joined.push(...seg.slice(1));
        else joined.push(...seg);
      }
      return joined;
    }
  }

  // Query OSRM with all waypoints in order
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
          const osrmKm = route.distance / 1000;

          // Detour safety check applies only when no user-selected via points are present
          if (!viaPoints?.length) {
            const isDetour = directDist > DIRECT_DIST_LIMIT_KM 
              ? (osrmKm > DETOUR_RATIO_LONG * directDist) 
              : (osrmKm > DETOUR_FLAT_SHORT_KM);
            if (isDetour) {
              console.warn(`OSRM detour safety triggered: OSRM is ${osrmKm.toFixed(1)}km vs direct ${directDist.toFixed(1)}km. Dropping snap.`);
              return [from, to];
            }
          }

          // Convert OSRM GeoJSON coords [lng, lat] to list of {lat, lng}
          if (route.geometry && route.geometry.coordinates) {
            return route.geometry.coordinates.map((coord: [number, number]) => ({
              lat: coord[1],
              lng: coord[0]
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

  // If multi-point query failed, fall back to pairwise snapping across via points
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

// Retroactive Snapper: Backfills missing road paths for all legs of a ride.
// Resilience: a pin-less leg gaps only itself. The next pinned leg still snaps
// from the last known GPS anchor (departure pin or previous pinned leg), so one
// name-only stop no longer wipes the routes of every leg after it.
export async function backfillRideRoutes(rideId: number): Promise<void> {
  // Query all legs for the ride sorted chronologically
  const legs = await db.legs.where('rideId').equals(rideId).toArray();
  const sortedLegs = sortLegs(legs);

  // Load the ride record to get the departure pin
  const rideRecord = await db.rides.get(rideId);

  // Last known GPS anchor; advances only through pinned legs.
  let lastKnownGps: { lat: number; lng: number } | null =
    rideRecord?.startLocation?.kind === 'gps'
      ? { lat: rideRecord.startLocation.lat, lng: rideRecord.startLocation.lng }
      : null;

  for (const currentLeg of sortedLegs) {
    // Pin-less leg (named or nothing): nothing to snap. Clear any stale path
    // from a previous edit, but leave the chain anchor untouched.
    if (currentLeg.location?.kind !== 'gps') {
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
      continue;
    }

    const toGps = { lat: currentLeg.location.lat, lng: currentLeg.location.lng };

    // First GPS anchor in the ride (no departure pin): establish it, nothing to
    // snap yet.
    if (!lastKnownGps) {
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
      lastKnownGps = toGps;
      continue;
    }

    const fromGps = lastKnownGps;

    // Check if we need to snap (either roadPath is missing, or endpoints changed)
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
