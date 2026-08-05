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
