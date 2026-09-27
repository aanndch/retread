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

describe('snapLeg (real-road snapping with via points)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('includes viaPoints in OSRM query string and decodes route geometry', async () => {
    const from = { lat: 18.52, lng: 73.85 }; // Pune
    const via = [{ lat: 16.70, lng: 74.24, name: 'Kolhapur' }];
    const to = { lat: 14.46, lng: 75.92 }; // Davangere

    let requestedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              distance: 630000,
              geometry: {
                type: 'LineString',
                coordinates: [
                  [73.85, 18.52],
                  [74.24, 16.70],
                  [75.92, 14.46],
                ],
              },
            },
          ],
        }),
      };
    });

    const result = await snapLeg(from, to, via, { maxAttempts: 0 });

    expect(requestedUrl).toContain('73.85,18.52;74.24,16.7;75.92,14.46');
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ lat: 18.52, lng: 73.85 });
    expect(result[1]).toEqual({ lat: 16.70, lng: 74.24 });
    expect(result[2]).toEqual({ lat: 14.46, lng: 75.92 });
  });

  it('falls back to straight-line waypoints when OSRM fails', async () => {
    const from = { lat: 18.52, lng: 73.85 };
    const via = [{ lat: 16.70, lng: 74.24 }];
    const to = { lat: 14.46, lng: 75.92 };

    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

    const result = await snapLeg(from, to, via, { maxAttempts: 0, timeoutMs: 50 });
    expect(result).toEqual([from, via[0], to]);
  });
});
