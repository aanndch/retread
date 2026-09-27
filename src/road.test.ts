import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { haversineDistance, snapLeg } from './road';

describe('haversineDistance', () => {
  it('calculates 0 distance for identical points', () => {
    const pt = { lat: 12.9716, lng: 77.5946 };
    expect(haversineDistance(pt, pt)).toBe(0);
  });

  it('calculates approximately correct distance between Bangalore and Mysore (~128-140 km direct)', () => {
    const bangalore = { lat: 12.9716, lng: 77.5946 };
    const mysore = { lat: 12.2958, lng: 76.6394 };
    const dist = haversineDistance(bangalore, mysore);
    expect(dist).toBeGreaterThan(120);
    expect(dist).toBeLessThan(150);
  });
});

describe('snapLeg with viaPoints', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('includes viaPoints in the OSRM query string and returns decoded path', async () => {
    const from = { lat: 12.97, lng: 77.59 };
    const via = [
      { lat: 12.52, lng: 76.89, name: 'Mandya' },
      { lat: 12.41, lng: 76.71, name: 'Srirangapatna' },
    ];
    const to = { lat: 12.30, lng: 76.64 };

    let requestedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              distance: 145000,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [77.59, 12.97],
                  [76.89, 12.52],
                  [76.71, 12.41],
                  [76.64, 12.30],
                ],
              },
            },
          ],
        }),
      };
    });

    const result = await snapLeg(from, to, via, { maxAttempts: 0 });

    expect(requestedUrl).toContain('77.59,12.97;76.89,12.52;76.71,12.41;76.64,12.3');
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ lat: 12.97, lng: 77.59 });
    expect(result[3]).toEqual({ lat: 12.30, lng: 76.64 });
  });

  it('falls back to [from, ...via, to] when fetch fails', async () => {
    const from = { lat: 12.97, lng: 77.59 };
    const via = [{ lat: 12.52, lng: 76.89 }];
    const to = { lat: 12.30, lng: 76.64 };

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await snapLeg(from, to, via, { maxAttempts: 0, timeoutMs: 100 });

    expect(result).toEqual([from, via[0], to]);
  });
});
