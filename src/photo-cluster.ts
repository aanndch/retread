/**
 * Pure two-level photo clustering: photo dump → structured legs.
 *
 * Level 1 splits photos into DAY buckets (calendar day). Level 2, within each
 * day, walks the photos sorted by time and clusters them into STOP legs: a new
 * leg starts when the next photo is "far" from the current stop. The clustering
 * is GPS-first (you moved = new stop) with a time gap as the fallback, per the
 * backfill plan. This module is deliberately pure — no DOM / File / browser
 * dependencies — so it runs under Node for unit tests and stays importable
 * anywhere in the app.
 */

/**
 * A single photo with its derived capture date and optional GPS. `date` is the
 * best-known capture time (EXIF when available, else file.lastModified).
 */
export interface PhotoPoint {
  id: string;
  date: Date;
  lat?: number | null;
  lng?: number | null;
}

/**
 * One detected stop: the photos that clustered together, the representative
 * date (the first photo's), and the stop's median GPS (null when no photo in
 * the cluster carries coordinates → the app renders that leg as a phantom).
 */
export interface StopLeg {
  photos: PhotoPoint[];
  date: Date;
  lat: number | null;
  lng: number | null;
  /** Reverse-geocoded place-name suggestion (P2). Unset until `suggestLegNames` runs. */
  name?: string;
}

/** A calendar-day bucket of one or more stop legs. `date` is a YYYY-MM-DD key. */
export interface DayGroup {
  date: string;
  legs: StopLeg[];
}

/** A new leg starts when the photo's GPS moved more than this far (meters) from the stop's median. */
export const STOP_DISTANCE_M = 2500;

/**
 * GPS-free fallback: a new leg starts when the time gap since the stop's last
 * photo exceeds this (ms). ~45 minutes of quiet between photos suggests travel.
 */
export const STOP_GAP_MS = 45 * 60 * 1000;

/**
 * A huge time gap (> ~3.5h) starts a new leg even when the photo is at the SAME
 * place as the current stop — you parked, waited, and left. Overrides GPS.
 */
export const DAY_BREAK_MS = 3.5 * 60 * 60 * 1000;

/** Earth mean radius in meters (haversine). */
const EARTH_RADIUS_M = 6371000;

/** Great-circle distance between two lat/lng points in meters. */
export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Median GPS of a set of photos, ignoring photos without coordinates.
 * Returns null when no photo in the set has GPS. The median (not the mean) is
 * robust to a stop's photo spread — you park here, walk to the viewpoint.
 */
export function medianGps(photos: PhotoPoint[]): { lat: number; lng: number } | null {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const p of photos) {
    if (p.lat != null && p.lng != null) {
      lats.push(p.lat);
      lngs.push(p.lng);
    }
  }
  if (lats.length === 0) return null;
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };
  return { lat: median(lats), lng: median(lngs) };
}

function hasGps(p: PhotoPoint): boolean {
  return p.lat != null && p.lng != null;
}

/**
 * Decides whether `photo` begins a new stop leg relative to the current cluster.
 *
 * GPS-first: when both the photo and the cluster carry GPS, a move of more than
 * STOP_DISTANCE_M from the cluster's median starts a new leg. A huge time gap
 * (> DAY_BREAK_MS) also starts a new leg even at the same place. When GPS is
 * missing on either side, the time gap (> STOP_GAP_MS) is the fallback.
 */
export function startsNewLeg(photo: PhotoPoint, cluster: PhotoPoint[]): boolean {
  const lastTime = cluster[cluster.length - 1].date.getTime();
  const gapMs = photo.date.getTime() - lastTime;

  if (hasGps(photo) && hasGps(cluster[cluster.length - 1])) {
    // Both sides have GPS → distance governs, but a huge gap overrides even
    // when the photo is at the same spot as the current stop.
    if (gapMs > DAY_BREAK_MS) return true;
    const median = medianGps(cluster);
    if (median) {
      return (
        haversineMeters(median.lat, median.lng, photo.lat as number, photo.lng as number) >
        STOP_DISTANCE_M
      );
    }
  }

  // No GPS on one or both sides → the time gap is the fallback. DAY_BREAK_MS >
  // STOP_GAP_MS, so a huge gap is already covered by this branch too.
  return gapMs > STOP_GAP_MS;
}

/** Local-time YYYY-MM-DD key for a date (matches the Leg.date format used app-wide). */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Clusters photos into day buckets, each containing stop legs.
 *
 * Photos are sorted chronologically, bucketed by calendar day (in first-appearance
 * order), and within each day grouped into stops using the GPS-first / time-fallback
 * rule. Each stop's lat/lng is the median GPS of its photos (null if none).
 * Empty input yields an empty array. Pure: no DOM / File / browser dependencies.
 */
export function clusterPhotos(photos: PhotoPoint[]): DayGroup[] {
  if (photos.length === 0) return [];

  const sorted = [...photos].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Day buckets, preserving first-appearance order (a map preserves insertion order).
  const days = new Map<string, PhotoPoint[]>();
  for (const p of sorted) {
    const key = dayKey(p.date);
    const bucket = days.get(key);
    if (bucket) bucket.push(p);
    else days.set(key, [p]);
  }

  const result: DayGroup[] = [];
  for (const [key, dayPhotos] of days) {
    // Split the day's photos into stop groups.
    const groups: PhotoPoint[][] = [];
    let current: PhotoPoint[] = [dayPhotos[0]];
    for (let i = 1; i < dayPhotos.length; i++) {
      if (startsNewLeg(dayPhotos[i], current)) {
        groups.push(current);
        current = [dayPhotos[i]];
      } else {
        current.push(dayPhotos[i]);
      }
    }
    groups.push(current);

    const legs: StopLeg[] = groups.map((photos) => {
      const median = medianGps(photos);
      return {
        photos,
        date: photos[0].date,
        lat: median ? median.lat : null,
        lng: median ? median.lng : null,
      };
    });

    result.push({ date: key, legs });
  }

  return result;
}
