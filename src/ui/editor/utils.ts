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

// India-biased forward geocoding via Nominatim. `countrycodes=in` plus a viewbox
// biases ranking toward India without bounding the result, so near-border
// places still resolve. Shared by the map picker search and the editor's
// best-effort name-to-pin.
export async function geocodePlace(query: string, signal?: AbortSignal): Promise<GeocodePlace[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=in&viewbox=68.0,6.0,98.0,36.0`,
    { headers: { Accept: 'application/json' }, signal }
  );
  if (!res.ok) throw new Error('Search failed');
  const data = (await res.json()) as any[];
  return data.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    name: shortPlaceName(r.address, r.display_name),
    display: r.display_name,
  }));
}

// Reverse geocode: nearest named place for a pin, or null when offline/unknown.
// Best-effort — used to suggest a label after a pin is placed.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
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

// Shared Leaflet loader: concurrent callers get one in-flight attempt, a
// partial global (script loaded, CSS missing) is not mistaken for success, and
// a failure clears the cache so a later retry actually reloads.
let leafletLoadPromise: Promise<void> | null = null;

export const loadLeaflet = (): Promise<void> => {
  if ((window as any).L?.map) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise<void>((resolve, reject) => {
    // Guard against duplicate stylesheets with an id.
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      if ((window as any).L?.map) resolve();
      else reject(new Error('Leaflet loaded without a usable API'));
    };
    script.onerror = () => reject(new Error('Failed to load Leaflet script'));
    document.body.appendChild(script);
  });

  // Clear the cache on settle so a rejected load can be retried; the L guard
  // above short-circuits future calls once it succeeds.
  leafletLoadPromise
    .finally(() => { leafletLoadPromise = null; })
    .catch(() => { /* swallow on the detached chain */ });

  return leafletLoadPromise;
};
