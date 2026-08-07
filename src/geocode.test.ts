import { describe, it, expect, vi } from 'vitest';
import {
  placeFromAddress,
  pickCover,
  suggestLegNames,
  PLACE_PRIORITY,
} from './geocode';
import type { GeocoderFn } from './geocode';
import type { DayGroup, PhotoPoint } from './photo-cluster';

const D = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min);

const pt = (
  id: string,
  date: Date,
  lat: number | null = null,
  lng: number | null = null
): PhotoPoint => ({ id, date, lat, lng });

function day(date: string, legs: PhotoPoint[][]): DayGroup {
  return {
    date,
    legs: legs.map((photos) => {
      const gps = photos.find((p) => p.lat != null && p.lng != null);
      return {
        photos,
        date: photos[0].date,
        lat: gps ? gps.lat! : null,
        lng: gps ? gps.lng! : null,
      };
    }),
  };
}

describe('placeFromAddress', () => {
  it('prefers village over town/city over county', () => {
    const address = {
      county: 'Himachal Pradesh',
      city: 'Kullu',
      village: 'Kaza',
    };
    expect(placeFromAddress(address)).toBe('Kaza');
  });

  it('walks the full priority order', () => {
    expect(placeFromAddress({ county: 'X', locality: 'Y', hamlet: 'Z' })).toBe('Z');
    expect(placeFromAddress({ county: 'X', locality: 'Y' })).toBe('Y');
    expect(placeFromAddress({ county: 'X' })).toBe('X');
  });

  it('skips empty/whitespace and non-string values', () => {
    expect(placeFromAddress({ village: '  ', town: 'Valley', city: 42 })).toBe('Valley');
    expect(placeFromAddress({ village: '', city: null })).toBeNull();
  });

  it('falls back to the result name when no settlement key matches', () => {
    expect(placeFromAddress({}, 'Mt. Kailash')).toBe('Mt. Kailash');
    expect(placeFromAddress({}, '')).toBeNull();
    expect(placeFromAddress({}, null)).toBeNull();
  });

  it('returns null for an empty address', () => {
    expect(placeFromAddress({})).toBeNull();
  });

  it('PLACE_PRIORITY is the documented settlement preference order', () => {
    expect(PLACE_PRIORITY).toEqual([
      'village',
      'town',
      'city',
      'municipality',
      'hamlet',
      'locality',
      'county',
    ]);
  });
});

describe('pickCover', () => {
  it('returns null for empty input', () => {
    expect(pickCover([])).toBeNull();
  });

  it('returns the first leg first photo for a single day', () => {
    const groups = [
      day('2026-08-10', [
        [pt('a', D(2026, 8, 10, 9, 0)), pt('b', D(2026, 8, 10, 9, 5))],
        [pt('c', D(2026, 8, 10, 12, 0))],
      ]),
    ];
    expect(pickCover(groups)).toBe('a');
  });

  it('multi-day: cover is the first photo of the whole dump', () => {
    const groups = [
      day('2026-08-10', [[pt('first', D(2026, 8, 10, 9, 0))]]),
      day('2026-08-11', [[pt('second', D(2026, 8, 11, 8, 0))]]),
    ];
    expect(pickCover(groups)).toBe('first');
  });

  it('skips empty days/legs and returns null when nothing has photos', () => {
    const groups: DayGroup[] = [
      { date: '2026-08-10', legs: [] },
      { date: '2026-08-11', legs: [] },
    ];
    expect(pickCover(groups)).toBeNull();
  });

  it('is deterministic across calls', () => {
    const groups = [
      day('2026-08-10', [
        [pt('x', D(2026, 8, 10, 9, 0)), pt('y', D(2026, 8, 10, 9, 5))],
      ]),
    ];
    expect(pickCover(groups)).toBe('x');
    expect(pickCover(groups)).toBe('x');
  });
});

describe('suggestLegNames', () => {
  it('fills names for legs with GPS via the injected geocoder', async () => {
    const geocoder: GeocoderFn = vi.fn(async (lat, _lng) =>
      lat === 12 ? 'Kaza' : 'Sarchu'
    );
    const groups = [
      day('2026-08-10', [
        [pt('a', D(2026, 8, 10, 9, 0), 12, 77)],
        [pt('b', D(2026, 8, 10, 12, 0), 32, 78)],
      ]),
    ];
    await suggestLegNames(groups, { geocoder, delayMs: 0 });
    expect(groups[0].legs[0].name).toBe('Kaza');
    expect(groups[0].legs[1].name).toBe('Sarchu');
    expect(geocoder).toHaveBeenCalledTimes(2);
  });

  it('skips legs without GPS', async () => {
    const geocoder: GeocoderFn = vi.fn(async () => 'Kaza');
    const groups = [
      day('2026-08-10', [
        [pt('a', D(2026, 8, 10, 9, 0), 12, 77)],
        [pt('b', D(2026, 8, 10, 12, 0))], // no GPS
      ]),
    ];
    await suggestLegNames(groups, { geocoder, delayMs: 0 });
    expect(groups[0].legs[0].name).toBe('Kaza');
    expect(groups[0].legs[1].name).toBeUndefined();
    expect(geocoder).toHaveBeenCalledTimes(1);
  });

  it('tolerates a failing geocoder — leaves the leg name unset', async () => {
    const geocoder: GeocoderFn = vi.fn(async () => null); // offline / failed
    const groups = [
      day('2026-08-10', [
        [pt('a', D(2026, 8, 10, 9, 0), 12, 77)],
        [pt('b', D(2026, 8, 10, 12, 0), 32, 78)],
      ]),
    ];
    await suggestLegNames(groups, { geocoder, delayMs: 0 });
    expect(groups[0].legs[0].name).toBeUndefined(); // name left unset → "Stop N" fallback
    expect(groups[0].legs[1].name).toBeUndefined();
    expect(geocoder).toHaveBeenCalledTimes(2);
  });

  it('does not delay before the first call but delays between calls', async () => {
    const calls: number[] = [];
    const geocoder: GeocoderFn = vi.fn(async (lat) => {
      calls.push(Date.now());
      return String(lat);
    });
    const groups = [
      day('2026-08-10', [
        [pt('a', D(2026, 8, 10, 9, 0), 12, 77)],
        [pt('b', D(2026, 8, 10, 9, 30), 13, 77)],
        [pt('c', D(2026, 8, 10, 10, 0), 14, 77)],
      ]),
    ];
    await suggestLegNames(groups, { geocoder, delayMs: 30 });
    expect(calls).toHaveLength(3);
    // First two run back-to-back (~no delay before the first); later ones lag.
    const gap1 = calls[1] - calls[0];
    const gap2 = calls[2] - calls[1];
    expect(gap1).toBeGreaterThanOrEqual(25);
    expect(gap2).toBeGreaterThanOrEqual(25);
  });

  it('returns the same dayGroups array (mutates legs in place)', async () => {
    const geocoder: GeocoderFn = vi.fn(async () => 'Kaza');
    const groups = [day('2026-08-10', [[pt('a', D(2026, 8, 10, 9, 0), 12, 77)]])];
    const out = await suggestLegNames(groups, { geocoder, delayMs: 0 });
    expect(out).toBe(groups);
  });
});
