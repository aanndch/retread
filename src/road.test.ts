import { describe, it, expect } from 'vitest';
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

describe('snapLeg (field-logbook routing)', () => {
  it('connects start and destination directly when no viaPoints are provided', async () => {
    const from = { lat: 12.97, lng: 77.59 };
    const to = { lat: 12.30, lng: 76.64 };

    const result = await snapLeg(from, to);
    expect(result).toEqual([from, to]);
  });

  it('connects start, intermediate viaPoints, and destination in order', async () => {
    const from = { lat: 12.97, lng: 77.59 };
    const via = [
      { lat: 12.52, lng: 76.89, name: 'Mandya' },
      { lat: 12.41, lng: 76.71, name: 'Srirangapatna' },
    ];
    const to = { lat: 12.30, lng: 76.64 };

    const result = await snapLeg(from, to, via);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(from);
    expect(result[1]).toEqual(via[0]);
    expect(result[2]).toEqual(via[1]);
    expect(result[3]).toEqual(to);
  });
});
