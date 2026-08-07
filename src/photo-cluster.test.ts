import { describe, it, expect } from 'vitest';
import {
  clusterPhotos,
  dayKey,
  haversineMeters,
  medianGps,
  DAY_BREAK_MS,
  STOP_DISTANCE_M,
  STOP_GAP_MS,
} from './photo-cluster';
import type { PhotoPoint } from './photo-cluster';

/** Local-time date constructor (day buckets use local calendar components). */
const D = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min);

const pt = (
  id: string,
  date: Date,
  lat: number | null = null,
  lng: number | null = null
): PhotoPoint => ({ id, date, lat, lng });

describe('clusterPhotos', () => {
  it('returns [] for empty input', () => {
    expect(clusterPhotos([])).toEqual([]);
  });

  it('single photo → one day, one leg', () => {
    const groups = clusterPhotos([pt('a', D(2026, 8, 10, 9, 0))]);
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe('2026-08-10');
    expect(groups[0].legs).toHaveLength(1);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a']);
  });

  it('GPS moves > STOP_DISTANCE_M → new leg within the same day', () => {
    // Two photos 15 min apart, ~5.5km apart in GPS (0.05 deg lat).
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 9, 15), 12.05, 77.0),
    ]);
    expect(groups[0].date).toBe('2026-08-10');
    expect(groups[0].legs).toHaveLength(2);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a']);
    expect(groups[0].legs[1].photos.map((p) => p.id)).toEqual(['b']);
  });

  it('GPS close + time close → one leg (dwell burst)', () => {
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 9, 5), 12.001, 77.001),
      pt('c', D(2026, 8, 10, 9, 10), 12.0005, 77.0005),
    ]);
    expect(groups[0].legs).toHaveLength(1);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('long gap at SAME GPS stays one leg (GPS-first overrides time fallback)', () => {
    // 2h gap (well past STOP_GAP_MS) but identical GPS and < DAY_BREAK_MS.
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 11, 0), 12.0, 77.0),
    ]);
    expect(groups[0].legs).toHaveLength(1);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('huge gap > DAY_BREAK_MS at SAME GPS → new leg', () => {
    // 4h gap at identical GPS (exceeds DAY_BREAK_MS).
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 13, 0), 12.0, 77.0),
    ]);
    expect(groups[0].legs).toHaveLength(2);
  });

  it('no GPS → time gap > STOP_GAP_MS splits legs', () => {
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0)),
      pt('b', D(2026, 8, 10, 10, 0)), // 1h > 45min
    ]);
    expect(groups[0].legs).toHaveLength(2);
  });

  it('no GPS → small time gap stays one leg', () => {
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0)),
      pt('b', D(2026, 8, 10, 9, 20)),
    ]);
    expect(groups[0].legs).toHaveLength(1);
  });

  it('overnight → separate day buckets', () => {
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 23, 30), 12.0, 77.0),
      pt('b', D(2026, 8, 11, 7, 30), 12.0, 77.0),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-08-10', '2026-08-11']);
    expect(groups[0].legs).toHaveLength(1);
    expect(groups[1].legs).toHaveLength(1);
  });

  it('sorts unsorted input chronologically', () => {
    const groups = clusterPhotos([
      pt('late', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('early', D(2026, 8, 10, 8, 0), 12.0, 77.0),
    ]);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['early', 'late']);
  });

  it('leg lat/lng = median GPS of its photos (null when none)', () => {
    const withGps = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 9, 5), 12.0, 77.002),
      pt('c', D(2026, 8, 10, 9, 10), 12.0, 77.004),
    ]);
    expect(withGps[0].legs).toHaveLength(1);
    expect(withGps[0].legs[0].lat).toBe(12.0);
    expect(withGps[0].legs[0].lng).toBe(77.002);

    const noGps = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0)),
      pt('b', D(2026, 8, 10, 9, 5)),
    ]);
    expect(noGps[0].legs[0].lat).toBeNull();
    expect(noGps[0].legs[0].lng).toBeNull();
  });

  it('GPS spread of ~100-200m at the same stop does NOT split into new legs', () => {
    // Three photos within ~200m of each other (≈0.0018 deg lat) — you parked and
    // walked the viewpoint. Distance is far below STOP_DISTANCE_M → one leg.
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 9, 5), 12.001, 77.0),
      pt('c', D(2026, 8, 10, 9, 12), 12.0018, 77.0),
    ]);
    expect(groups[0].legs).toHaveLength(1);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('mixed GPS within a stop + small time gap → stays one leg', () => {
    // Some photos carry GPS, some don't, all within ~250m and a small time gap.
    // The GPS boundary is only hit when BOTH sides have GPS; the missing side
    // makes the time fallback govern, and the gap is far below STOP_GAP_MS.
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 9, 4)), // no GPS
      pt('c', D(2026, 8, 10, 9, 8), 12.0005, 77.0005),
      pt('d', D(2026, 8, 10, 9, 12)), // no GPS
    ]);
    expect(groups[0].legs).toHaveLength(1);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    // Leg median still uses whichever photos carry GPS.
    expect(groups[0].legs[0].lat).toBeCloseTo(12.00025, 5);
  });

  it('photos just before/after midnight land in their correct day buckets', () => {
    // 23:59:59.999 on day 1 and 00:00:00 on day 2 — a few ms apart in time but
    // different local calendar days → separate buckets, one leg each.
    const groups = clusterPhotos([
      pt('before', new Date(2026, 7, 10, 23, 59, 59, 999), 12.0, 77.0),
      pt('after', new Date(2026, 7, 11, 0, 0, 0, 0), 12.0, 77.0),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-08-10', '2026-08-11']);
    expect(groups[0].legs[0].photos.map((p) => p.id)).toEqual(['before']);
    expect(groups[1].legs[0].photos.map((p) => p.id)).toEqual(['after']);
  });

  it('a single isolated photo (big gap before and after) is its own leg', () => {
    // Middle photo is hours from both neighbours → splits into its own leg on
    // each boundary (GPS present, so a > DAY_BREAK_MS gap still splits).
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 8, 0), 12.0, 77.0),
      pt('solo', D(2026, 8, 10, 13, 0), 12.0, 77.0), // 5h from both
      pt('c', D(2026, 8, 10, 18, 0), 12.0, 77.0),
    ]);
    expect(groups[0].legs).toHaveLength(3);
    expect(groups[0].legs.map((l) => l.photos.map((p) => p.id))).toEqual([
      ['a'],
      ['solo'],
      ['c'],
    ]);
  });

  it('mixed GPS presence → time fallback governs the non-GPS boundary', () => {
    // First has GPS, second has none, gap is small → one leg.
    const groups = clusterPhotos([
      pt('a', D(2026, 8, 10, 9, 0), 12.0, 77.0),
      pt('b', D(2026, 8, 10, 9, 10)),
    ]);
    expect(groups[0].legs).toHaveLength(1);
    // Leg median falls back to whichever photos have GPS.
    expect(groups[0].legs[0].lat).toBe(12.0);
    expect(groups[0].legs[0].lng).toBe(77.0);
  });
});

describe('helpers', () => {
  it('dayKey formats local YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 7, 3))).toBe('2026-08-03');
    expect(dayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('haversineMeters computes ~5.5km for 0.05 deg latitude', () => {
    const d = haversineMeters(12.0, 77.0, 12.05, 77.0);
    expect(d).toBeGreaterThan(5000);
    expect(d).toBeLessThan(6000);
  });

  it('haversineMeters returns 0 for identical points', () => {
    expect(haversineMeters(12.0, 77.0, 12.0, 77.0)).toBe(0);
  });

  it('medianGps ignores photos without GPS and returns null when none', () => {
    expect(
      medianGps([
        pt('a', D(2026, 8, 10), 10, 20),
        pt('b', D(2026, 8, 10), 30, 40),
        pt('c', D(2026, 8, 10)),
      ])
    ).toEqual({ lat: 20, lng: 30 });
    expect(medianGps([pt('a', D(2026, 8, 10))])).toBeNull();
  });

  it('thresholds are exported and tunable', () => {
    expect(STOP_DISTANCE_M).toBeGreaterThan(1000);
    expect(STOP_GAP_MS).toBeGreaterThan(STOP_DISTANCE_M); // ms vs m — just sanity
    expect(DAY_BREAK_MS).toBeGreaterThan(STOP_GAP_MS); // huge gap > normal gap
  });
});
