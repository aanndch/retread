import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import type { SquiggleSegment, SquiggleStop } from '../ui/squiggle';
import { DAY_COLORS } from '../ui/squiggle';
import { CloseIcon } from './icons';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useExitFade } from './use-exit-fade';
import { useOverlayFocus } from './use-overlay-focus';
import { loadMaplibre, type MaplibreGLModule } from '../ui/editor/utils';
import { getActiveTheme, Theme } from '../theme';
import type { Map as MaplibreMap, Marker as MaplibreMarker } from 'maplibre-gl';

interface MapModalProps {
  isOpen: boolean;
  path?: { lat: number; lng: number }[];
  segments?: SquiggleSegment[];
  stops?: SquiggleStop[];
  compass?: boolean;
  caption?: string;
  onClose: () => void;
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const DARK_THEMES: ReadonlySet<string> = new Set([Theme.Nightfall, Theme.Midnight, Theme.Cyberpunk]);
const FALLBACK_DAY_HEXES = ['#2b2926', '#4e4436', '#6e6a61', '#8a7355', '#a39478', '#6b8270'];

function resolveColor(color: string | undefined, defaultIndex: number): string {
  if (!color) {
    const rawDay = DAY_COLORS[defaultIndex % DAY_COLORS.length];
    const match = rawDay.match(/var\((--[^)]+)\)/);
    if (match && typeof window !== 'undefined') {
      const val = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
      if (val) return val;
    }
    return FALLBACK_DAY_HEXES[defaultIndex % FALLBACK_DAY_HEXES.length];
  }
  if (color.startsWith('var(') && typeof window !== 'undefined') {
    const match = color.match(/var\((--[^)]+)\)/);
    if (match) {
      const val = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
      if (val) return val;
    }
  }
  return color;
}

function buildGeoJsonFeatures(
  segments?: SquiggleSegment[],
  path?: { lat: number; lng: number }[]
) {
  const features: any[] = [];

  if (segments && segments.length > 0) {
    segments.forEach((seg, idx) => {
      if (seg.path && seg.path.length > 1) {
        features.push({
          type: 'Feature',
          properties: {
            id: idx,
            color: resolveColor(seg.color, idx),
            fallback: !!seg.fallback,
          },
          geometry: {
            type: 'LineString',
            coordinates: seg.path.map((p) => [p.lng, p.lat]),
          },
        });
      }
    });
  } else if (path && path.length > 1) {
    features.push({
      type: 'Feature',
      properties: {
        id: 0,
        color: resolveColor(undefined, 0),
        fallback: false,
      },
      geometry: {
        type: 'LineString',
        coordinates: path.map((p) => [p.lng, p.lat]),
      },
    });
  }

  return features;
}

function computeBounds(
  maplibregl: MaplibreGLModule,
  features: any[],
  stops?: SquiggleStop[]
) {
  const bounds = new maplibregl.LngLatBounds();
  let count = 0;

  features.forEach((f) => {
    f.geometry.coordinates.forEach((coord: [number, number]) => {
      bounds.extend(coord);
      count++;
    });
  });

  stops?.forEach((s) => {
    if (s.kind !== 'phantom' && !isNaN(s.lat) && !isNaN(s.lng)) {
      bounds.extend([s.lng, s.lat]);
      count++;
    }
  });

  return count > 0 ? bounds : null;
}

function createStopMarkers(
  map: MaplibreMap,
  maplibregl: MaplibreGLModule,
  stops?: SquiggleStop[]
): MaplibreMarker[] {
  if (!stops || stops.length === 0) return [];
  const markers: MaplibreMarker[] = [];
  let stopCounter = 1;

  stops.forEach((s) => {
    if (s.kind === 'phantom' || isNaN(s.lat) || isNaN(s.lng)) return;

    const el = document.createElement('div');
    const isStart = s.kind === 'start';
    const isEnd = s.kind === 'end';

    if (isStart) {
      el.className = 'route-marker-badge marker-start';
      el.innerHTML = '<span style="display:block;width:6px;height:6px;border-radius:50%;background:currentColor;"></span>';
    } else if (isEnd) {
      el.className = 'route-marker-badge marker-end';
      el.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
          <line x1="4" y1="22" x2="4" y2="15"></line>
        </svg>`;
    } else {
      el.className = 'route-marker-badge';
      el.textContent = String(stopCounter++);
    }

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'center',
    }).setLngLat([s.lng, s.lat]);

    if (s.label) {
      const popup = new maplibregl.Popup({
        offset: 12,
        closeButton: false,
      }).setHTML(`<strong>${s.label}</strong>`);
      marker.setPopup(popup);
    }

    marker.addTo(map);
    markers.push(marker);
  });

  return markers;
}

export function MapModal({ isOpen, path, segments, stops, caption, onClose }: MapModalProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const maplibreglRef = useRef<MaplibreGLModule | null>(null);
  const markersRef = useRef<MaplibreMarker[]>([]);

  // Overlay envelope: the URL owns open/close (isOpen), so closing is a plain
  // onClose() — useExitFade keeps us mounted through the --motion-base fade-out.
  const { visible, closing } = useExitFade(isOpen);
  useBodyScrollLock(visible);
  const backdropRef = useRef<HTMLDivElement>(null);
  useOverlayFocus(visible, backdropRef);

  // Load MapLibre on demand
  useEffect(() => {
    let active = true;
    loadMaplibre()
      .then((m) => {
        if (active) {
          maplibreglRef.current = m;
          setMapLoaded(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load MapLibre library for route map:', err);
      });
    return () => { active = false; };
  }, []);

  // Dialog semantics: Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fit camera to the route bounds
  const fitRoute = useCallback(() => {
    const map = mapRef.current;
    const maplibregl = maplibreglRef.current;
    if (!map || !maplibregl) return;
    const features = buildGeoJsonFeatures(segments, path);
    const bounds = computeBounds(maplibregl, features, stops);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 40, right: 40 },
        maxZoom: 15,
        duration: 600,
      });
    }
  }, [segments, path, stops]);

  // Initialize MapLibre GL map when modal is visible
  useEffect(() => {
    if (!visible || !mapLoaded || !containerRef.current || !maplibreglRef.current) return;
    const maplibregl = maplibreglRef.current;
    const isDark = DARK_THEMES.has(getActiveTheme());
    const paperColor = resolveColor('var(--color-paper)', 0) || '#f4efe6';

    const features = buildGeoJsonFeatures(segments, path);
    const bounds = computeBounds(maplibregl, features, stops);

    let initialCenter: [number, number] = [78.9629, 20.5937];
    let initialZoom = 5;

    if (bounds) {
      const center = bounds.getCenter();
      initialCenter = [center.lng, center.lat];
    }

    let map: MaplibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: isDark ? DARK_STYLE_URL : STYLE_URL,
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: false,
      });
    } catch (err) {
      console.error('Failed to create route map:', err);
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      // 1. Add GeoJSON route source
      map.addSource('route-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features,
        },
      });

      // 2. Halo / casing under-layer for crisp separation from roads
      map.addLayer({
        id: 'route-halo',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': paperColor,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            4, 5,
            8, 7,
            12, 9,
            16, 12,
          ],
          'line-opacity': 0.95,
        },
      });

      // 3. Highlighted route line layer
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            4, 3,
            8, 4.5,
            12, 6,
            16, 8,
          ],
          'line-opacity': 1,
        },
      });

      // 4. Add stop markers
      markersRef.current = createStopMarkers(map, maplibregl, stops);

      // 5. Fit bounds to the route
      if (bounds) {
        map.fitBounds(bounds, {
          padding: { top: 70, bottom: 70, left: 40, right: 40 },
          maxZoom: 15,
          duration: 0,
        });
      }
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      try { map.remove(); } catch (_) { /* already removed */ }
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [visible, mapLoaded]);

  if (!visible) return null;

  return (
    <div
      ref={backdropRef}
      class={`modal-backdrop map-overlay-backdrop${closing ? ' closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Route map"
      onClick={onClose}
    >
      <button
        type="button"
        class="btn-close-overlay"
        aria-label="Close map"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon size={16} />
      </button>

      {caption && (
        <div class="map-route-caption" onClick={(e) => e.stopPropagation()}>
          {caption}
        </div>
      )}

      <div
        class="map-route-canvas-container"
        onClick={(e) => e.stopPropagation()}
      >
        {!mapLoaded ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-paper)',
              fontFamily: 'var(--font-typewriter)',
              fontSize: '13px',
              color: 'var(--color-ink-muted)',
            }}
          >
            Loading route map…
          </div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {mapLoaded && (
        <button
          type="button"
          class="btn-map-fit"
          onClick={(e) => {
            e.stopPropagation();
            fitRoute();
          }}
          aria-label="Fit route"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
          Fit Route
        </button>
      )}
    </div>
  );
}
