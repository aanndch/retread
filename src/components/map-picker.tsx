import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { Button } from './button';
import { loadLeaflet } from '../ui/editor/utils';
import type { LocationUnion } from '../types';

interface MapPickerProps {
  isOpen: boolean;
  initialLocation: LocationUnion | null;
  fallbackCenter: [number, number] | null;
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

interface GeocodeResult {
  lat: number;
  lng: number;
  name: string;
  display: string;
}

const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 500;

export function MapPicker({
  isOpen,
  initialLocation,
  fallbackCenter,
  onConfirm,
  onClose,
  showToast,
}: MapPickerProps) {
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [closing, setClosing] = useState(false);
  const mapRef = useRef<any>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const lastSearchedRef = useRef('');

  const handleClose = (action: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      action();
    }, 250);
  };

  // Load Leaflet resources once modal opens
  useEffect(() => {
    let active = true;
    loadLeaflet()
      .then(() => { if (active) setLeafletLoaded(true); })
      .catch((err) => {
        console.error('Failed to load Leaflet library:', err);
        showToast('Failed to load map libraries.');
      });
    return () => { active = false; };
  }, []);

  // Clean up map instance when modal unmounts
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) {}
        mapRef.current = null;
      }
    };
  }, []);

  // Stable ref callback — only creates the map once
  const mapContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (mapRef.current) return; // already initialized
    if (!(window as any).L) return;
    const L = (window as any).L;

    let center: [number, number] = [31.1048, 77.1734];
    if (initialLocation?.kind === 'gps') {
      center = [initialLocation.lat, initialLocation.lng];
    } else if (fallbackCenter) {
      center = fallbackCenter;
    }

    const map = L.map(el, { zoomControl: false }).setView(center, 13);

    // Place zoom control on the right to avoid overlapping the search bar
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    // Dismiss search results on map interaction
    map.on('click', () => setShowResults(false));
    map.on('dragstart', () => setShowResults(false));

    mapRef.current = map;
  }, [initialLocation, fallbackCenter]);

  // Geocode search via Nominatim
  const geocode = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setShowResults(false);
      return;
    }
    if (trimmed === lastSearchedRef.current) return;
    lastSearchedRef.current = trimmed;

    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&limit=5&addressdetails=1`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      const mapped: GeocodeResult[] = data.map((r: any) => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        name: r.display_name.split(',')[0],
        display: r.display_name,
      }));
      setResults(mapped);
      setShowResults(mapped.length > 0);
    } catch (err) {
      console.error('Geocode error:', err);
      setResults([]);
      setShowResults(false);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search on input
  const handleSearchInput = (value: string) => {
    setQuery(value);
    setShowResults(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      lastSearchedRef.current = '';
      return;
    }

    debounceRef.current = window.setTimeout(() => geocode(value), DEBOUNCE_MS);
  };

  // Pan map to a geocoded result
  const handleSelectResult = useCallback((r: GeocodeResult) => {
    const map = mapRef.current;
    if (map) {
      map.setView([r.lat, r.lng], 14);
    }
    setQuery(r.name);
    setShowResults(false);
    setResults([]);
    lastSearchedRef.current = '';
  }, []);

  if (!isOpen) return null;

  const handleConfirm = (e: MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      if (!mapRef.current) return;
      const center = mapRef.current.getCenter();
      if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
        throw new Error('Invalid center coordinates');
      }
      onConfirm(center.lat, center.lng);
      handleClose(onClose);
    } catch (err) {
      console.error('Failed to confirm map picker pin:', err);
      showToast('Error setting coordinates from map.');
      handleClose(onClose);
    }
  };

  return (
    <div class={`modal-backdrop${closing ? ' closing' : ''}`} style={{ zIndex: 3000 }} onClick={() => handleClose(onClose)}>
      <div
        class={`modal-content${closing ? ' closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 0, overflow: 'hidden', width: '100%', maxWidth: '480px' }}
      >
        {/* Header */}
        <div
          class="map-picker-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-ink-muted)',
          }}
        >
          <h4 style={{ margin: 0 }}>Pick Location</h4>
          <button
            type="button"
            class="btn-clear"
            onClick={() => handleClose(onClose)}
            style={{ fontSize: '20px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--color-ink)' }}
          >
            &times;
          </button>
        </div>

        {/* Map container — search floats on top */}
        <div style={{ position: 'relative', width: '100%', height: '400px' }}>
          {/* Map mount point */}
          {!leafletLoaded ? (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-paper-dim)',
              fontFamily: 'var(--font-typewriter)', fontSize: '13px',
            }}>
              Loading map...
            </div>
          ) : (
            <div
              ref={mapContainerRef}
              style={{ width: '100%', height: '100%', background: 'var(--color-paper-dim)' }}
            />
          )}

          {/* Crosshair */}
          {leafletLoaded && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none', zIndex: 2000,
            }}>
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <circle cx="15" cy="15" r="4" stroke="var(--color-ink)" strokeWidth="2" fill="var(--color-paper)" />
                <line x1="15" y1="0" x2="15" y2="10" stroke="var(--color-ink)" strokeWidth="2" />
                <line x1="15" y1="20" x2="15" y2="30" stroke="var(--color-ink)" strokeWidth="2" />
                <line x1="0" y1="15" x2="10" y2="15" stroke="var(--color-ink)" strokeWidth="2" />
                <line x1="20" y1="15" x2="30" y2="15" stroke="var(--color-ink)" strokeWidth="2" />
              </svg>
            </div>
          )}

          {/* Search bar — floats on top of the map */}
          {leafletLoaded && (
            <div style={{ position: 'absolute', top: '12px', left: '12px', right: '60px', zIndex: 2200 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  class="search-input"
                  placeholder={`Search place (min ${MIN_QUERY_LEN} chars)...`}
                  value={query}
                  onInput={(e) => handleSearchInput((e.target as HTMLInputElement).value)}
                  onFocus={() => { if (results.length > 0) setShowResults(true); }}
                  style={{
                    fontSize: '13px', padding: '8px 32px 8px 12px',
                    boxShadow: '2px 2px 0px var(--color-shadow)',
                  }}
                />
                {searching && (
                  <span style={{
                    position: 'absolute', right: '10px', top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '10px', color: 'var(--color-ink-muted)',
                    fontFamily: 'var(--font-mechanical)',
                  }}>
                    …
                  </span>
                )}
              </div>

              {/* Results dropdown — overlays the map below the search bar */}
              {showResults && results.length > 0 && (
                <div style={{
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-ink-muted)',
                  borderTop: 'none',
                  borderRadius: '0 0 var(--border-radius) var(--border-radius)',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  boxShadow: '2px 2px 0px var(--color-shadow)',
                }}>
                  {results.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', border: 'none',
                        borderBottom: i < results.length - 1 ? '1px dashed var(--color-paper-dim)' : 'none',
                        background: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font-typewriter)', fontSize: '12px',
                        color: 'var(--color-ink)',
                      }}
                      onClick={() => handleSelectResult(r)}
                    >
                      <span style={{ display: 'block', fontWeight: 600 }}>{r.name}</span>
                      <span style={{
                        display: 'block', fontSize: '10px',
                        color: 'var(--color-ink-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{r.display}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          class="page-action-row page-action-modal"
          style={{
            padding: 'var(--spacing-md)',
            background: 'var(--color-paper-dim)',
            borderTop: '1px solid var(--color-ink-muted)',
            marginTop: 0,
          }}
        >
          <Button variant="secondary" size="sm" onClick={() => handleClose(onClose)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!leafletLoaded}>
            Confirm Location
          </Button>
        </div>
      </div>
    </div>
  );
}
