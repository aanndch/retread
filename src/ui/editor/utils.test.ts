import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCoordinates, geocodePlace, reverseGeocode } from './utils';

describe('parseCoordinates', () => {
  it('parses standard comma-separated coordinates', () => {
    const res = parseCoordinates('12.9716, 77.5946');
    expect(res).toEqual({ lat: 12.9716, lng: 77.5946 });
  });

  it('parses negative coordinates', () => {
    const res = parseCoordinates('-33.8688, 151.2093');
    expect(res).toEqual({ lat: -33.8688, lng: 151.2093 });
  });

  it('parses Google Maps URL containing @lat,lng', () => {
    const res = parseCoordinates('https://www.google.com/maps/@12.9715987,77.5945627,15z');
    expect(res?.lat).toBeCloseTo(12.9715987);
    expect(res?.lng).toBeCloseTo(77.5945627);
  });

  it('returns null for regular text search', () => {
    expect(parseCoordinates('Mysore Palace')).toBeNull();
  });
});

describe('geocodePlace', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('immediately returns coordinates when pasting raw lat,lng without calling network', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const res = await geocodePlace('12.9716, 77.5946');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res).toHaveLength(1);
    expect(res[0].lat).toBe(12.9716);
    expect(res[0].lng).toBe(77.5946);
  });

  it('queries Photon with query, limit, and camera proximity lat/lon bias', async () => {
    let requestedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              geometry: { type: 'Point', coordinates: [76.655, 12.305] },
              properties: {
                name: 'Mysuru',
                county: 'Mysuru taluk',
                state: 'Karnataka',
                country: 'India',
              },
            },
          ],
        }),
      };
    });

    const res = await geocodePlace('mysore', { lat: 12.97, lng: 77.59 });

    expect(requestedUrl).toContain('photon.komoot.io/api');
    expect(requestedUrl).toContain('q=mysore');
    expect(requestedUrl).toContain('lat=12.97');
    expect(requestedUrl).toContain('lon=77.59');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Mysuru');
    expect(res[0].lat).toBe(12.305);
    expect(res[0].lng).toBe(76.655);
    expect(res[0].display).toContain('Mysuru');
  });

  it('falls back to Nominatim when Photon fails', async () => {
    let callIndex = 0;
    let fallbackUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callIndex++;
      if (callIndex === 1) {
        throw new Error('Photon network error');
      }
      fallbackUrl = url;
      return {
        ok: true,
        json: async () => [
          {
            lat: '12.305',
            lon: '76.655',
            display_name: 'Mysuru, Karnataka, India',
            address: { city: 'Mysuru', state: 'Karnataka' },
          },
        ],
      };
    });

    const res = await geocodePlace('mysore', { lat: 12.97, lng: 77.59 });

    expect(fallbackUrl).toContain('nominatim.openstreetmap.org/search');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Mysuru');
  });
});

describe('reverseGeocode', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('reverse geocodes coordinates via Photon', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            properties: {
              name: 'Madikeri',
              state: 'Karnataka',
            },
          },
        ],
      }),
    });

    const name = await reverseGeocode(12.42, 75.73);
    expect(name).toBe('Madikeri');
  });
});
