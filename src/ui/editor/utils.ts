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

export const loadLeaflet = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if ((window as any).L) {
      resolve();
      return;
    }

    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.appendChild(script);
  });
};
