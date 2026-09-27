export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  // 1. Match standard coordinates: e.g. "31.2245, 77.3456"
  const coordRegex = /(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/;
  const match = text.match(coordRegex);
  if (match) {
    return {
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    };
  }

  // 2. Match Google Maps URL coordinates: e.g. "@31.2245,77.3456"
  const urlRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const urlMatch = text.match(urlRegex);
  if (urlMatch) {
    return {
      lat: parseFloat(urlMatch[1]),
      lng: parseFloat(urlMatch[2])
    };
  }

  return null;
}

// A resolved place: coordinates plus a short label and the full OSM display.
export interface GeocodePlace {
  lat: number;
  lng: number;
  name: string;
  display: string;
}

// Short human label from an OSM address object ("Madikeri", "Bengaluru").
function shortPlaceName(address: unknown, displayName: string): string {
  const a = address as Record<string, string> | null | undefined;
  if (a) {
    const pick = a.city || a.town || a.village || a.hamlet ||
      a.state_district || a.county || a.state || a.suburb;
    if (pick) return pick;
  }
  return displayName.split(',')[0].trim();
}

export interface GeocodeOptions {
  signal?: AbortSignal;
  lat?: number;
  lng?: number;
}

// Multi-engine place search:
// 1. Direct coordinate parse (raw lat/lng or Google Maps link).
// 2. Primary: Photon (Komoot / Elasticsearch OSM) with typo-tolerance, fuzzy matching & camera proximity.
// 3. Fallback: OpenStreetMap Nominatim with proximity viewbox.
export async function geocodePlace(
  query: string,
  optionsOrSignal?: AbortSignal | GeocodeOptions
): Promise<GeocodePlace[]> {
  const options: GeocodeOptions =
    optionsOrSignal instanceof AbortSignal
      ? { signal: optionsOrSignal }
      : (optionsOrSignal ?? {});

  const { signal, lat, lng } = options;
  const trimmed = query.trim();

  // 1. Direct coordinate paste check
  const coords = parseCoordinates(trimmed);
  if (coords) {
    return [
      {
        lat: coords.lat,
        lng: coords.lng,
        name: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        display: `Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
      },
    ];
  }

  // 2. Primary search: Photon (fast, typo-tolerant, fuzzy matching)
  try {
    let photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=6&lang=en`;
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      photonUrl += `&lat=${lat}&lon=${lng}`;
    }

    const res = await fetch(photonUrl, {
      headers: { Accept: 'application/json' },
      signal,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.features && Array.isArray(data.features) && data.features.length > 0) {
        const results: GeocodePlace[] = [];
        for (const f of data.features) {
          const coords = f.geometry?.coordinates;
          if (!coords || coords.length < 2) continue;
          const p = f.properties || {};
          const name = p.name || p.city || p.town || p.village || p.street || 'Selected Location';
          const contextParts = [
            p.street,
            p.locality,
            p.district,
            p.city !== name ? p.city : null,
            p.town !== name ? p.town : null,
            p.county,
            p.state,
            p.country,
          ].filter(Boolean);
          const cleanContext = Array.from(new Set(contextParts)).join(', ');
          results.push({
            lat: coords[1],
            lng: coords[0],
            name,
            display: cleanContext ? `${name}, ${cleanContext}` : name,
          });
        }
        if (results.length > 0) {
          return results;
        }
      }
    }
  } catch (photonErr) {
    if (signal?.aborted) throw photonErr;
    console.warn('Photon search failed, falling back to Nominatim:', photonErr);
  }

  // 3. Fallback: OpenStreetMap Nominatim
  try {
    let nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=5&addressdetails=1&countrycodes=in`;
    if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      nominatimUrl += `&viewbox=${lng - 1.5},${lat - 1.5},${lng + 1.5},${lat + 1.5}&bounded=0`;
    } else {
      nominatimUrl += `&viewbox=68.0,6.0,98.0,36.0`;
    }

    const res = await fetch(nominatimUrl, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) throw new Error('Search failed');
    const data = (await res.json()) as any[];
    return data.map((r) => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      name: shortPlaceName(r.address, r.display_name),
      display: r.display_name,
    }));
  } catch (nomErr) {
    if (signal?.aborted) throw nomErr;
    throw nomErr;
  }
}

// Reverse geocode: nearest named place for a pin, or null when offline/unknown.
// Best-effort — used to suggest a label after a pin is placed.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // 1. Primary: Photon reverse geocoding
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const p = data.features[0].properties || {};
        const name = p.name || p.city || p.town || p.village || p.suburb || p.locality || p.county;
        if (name) return name;
      }
    }
  } catch {
    // Fall through to Nominatim
  }

  // 2. Fallback: Nominatim reverse geocoding
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=12`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return shortPlaceName(data.address, data.display_name || '') || null;
  } catch {
    return null;
  }
}

// Shared MapLibre GL loader: concurrent callers get one in-flight attempt,
// styles and the library are dynamically imported on-demand, and failures
// clear the cache so a retry can reload.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

export type MaplibreGLModule = typeof import('maplibre-gl');

let maplibreLoadPromise: Promise<MaplibreGLModule> | null = null;
let maplibreInstance: MaplibreGLModule | null = null;

export const loadMaplibre = async (): Promise<MaplibreGLModule> => {
  if (maplibreInstance) return maplibreInstance;
  if (maplibreLoadPromise) return maplibreLoadPromise;

  maplibreLoadPromise = (async () => {
    await import('maplibre-gl/dist/maplibre-gl.css');
    const mod = await import('maplibre-gl');
    if (typeof mod.setWorkerUrl === 'function') {
      mod.setWorkerUrl(workerUrl);
    }
    maplibreInstance = mod;
    return mod;
  })();

  maplibreLoadPromise
    .finally(() => { maplibreLoadPromise = null; })
    .catch(() => { /* swallow on detached chain so retries work */ });

  return maplibreLoadPromise;
};
