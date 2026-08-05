import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { Button } from './button';
import { FieldCard } from './field-card';
import { loadLeaflet, geocodePlace, reverseGeocode, type GeocodePlace } from '../ui/editor/utils';
import { getActiveTheme, Theme } from '../theme';
import type { LocationUnion } from '../types';

interface MapPickerProps {
  isOpen: boolean;
  initialLocation: LocationUnion | null;
  fallbackCenter: [number, number] | null;
  onConfirm: (pin: { lat: number; lng: number } | null, name: string) => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

const MIN_QUERY_LEN = 3;
const DEBOUNCE_MS = 500;
const SEARCH_TIMEOUT_MS = 10000;
// No existing pin and no fallback: open on India rather than a random town.
const DEFAULT_CENTER: [number, number] = [20.5937, 78.9629];

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
// Dark themes use CARTO's dark_all raster set so the picker map matches the
// paper, instead of a light map glaring inside a dark sheet.
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_THEMES: ReadonlySet<string> = new Set([Theme.Nightfall, Theme.Midnight, Theme.Cyberpunk]);

// The selection point is the map center until the user taps the map, which
// locks the pin to that spot (tap-to-place). It visibly lands on any already
// set pin when the picker opens.
const PIN_HTML = `
<svg xmlns="http://www.w3.org/2000/svg" width="30" height="36" viewBox="0 0 30 36" fill="none">
  <path d="M15 1 C8 1 3 6 3 13 C3 23 15 35 15 35 C15 35 27 23 27 13 C27 6 22 1 15 1 Z"
        fill="var(--color-paper)" stroke="var(--color-ink)" stroke-width="2"/>
  <circle cx="15" cy="13" r="5" fill="var(--color-green)"/>
</svg>`;

export function MapPicker({
  isOpen,
  initialLocation,
  fallbackCenter,
  onConfirm,
  onClose,
  showToast,
}: MapPickerProps) {
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [leafletFailed, setLeafletFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [closing, setClosing] = useState(false);

  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Search state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodePlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [noMatches, setNoMatches] = useState(false);
  const [pinnedNow, setPinnedNow] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const searchSeqRef = useRef(0);
  const lastSearchedRef = useRef('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  // The tapped pin position; null until the user taps the map (center fallback).
  const pinnedRef = useRef<{ lat: number; lng: number } | null>(null);
  // Live Leaflet pin marker + its icon, so placing a pin (tap, existing pin,
  // or a picked search result) works from anywhere in the component.
  const pinMarkerRef = useRef<any>(null);
  const pinIconRef = useRef<any>(null);
  // The stop's label — edited in the modal, reverse-geocoded onto nameless pins.
  const [nameValue, setNameValue] = useState('');
  const nameValueRef = useRef('');
  nameValueRef.current = nameValue;

  const initialLocationRef = useRef(initialLocation);
  const fallbackCenterRef = useRef(fallbackCenter);
  initialLocationRef.current = initialLocation;
  fallbackCenterRef.current = fallbackCenter;

  const handleClose = (action: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      action();
    }, 250);
  };

  // Load Leaflet once on mount; bumping loadAttempt retries after a failure.
  useEffect(() => {
    let active = true;
    setLeafletFailed(false);
    loadLeaflet()
      .then(() => { if (active) setLeafletLoaded(true); })
      .catch((err) => {
        console.error('Failed to load Leaflet library:', err);
        if (active) setLeafletFailed(true);
      });
    return () => { active = false; };
  }, [loadAttempt]);

  // Reset transient state on each open and invalidate any in-flight searches.
  useEffect(() => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    searchSeqRef.current += 1;
    if (isOpen) {
      setQuery('');
      setResults([]);
      setShowResults(false);
      setNoMatches(false);
      setPinnedNow(false);
      pinnedRef.current = null;
      setNameValue(initialLocationRef.current?.name || '');
      lastSearchedRef.current = '';
    }
  }, [isOpen]);

  // Suggest a label for a placed pin via reverse geocode, only when the label
  // is still empty (never clobbers a name the user typed).
  const fillNameFromPin = useCallback(async (lat: number, lng: number) => {
    if (nameValueRef.current) return;
    const n = await reverseGeocode(lat, lng);
    if (n && !nameValueRef.current) setNameValue(n);
  }, []);

  // Place (or move) the pin marker at a given spot — used by taps, the initial
  // existing pin, and picking a search result.
  const placePinAt = useCallback((latlng: { lat: number; lng: number }) => {
    const map = mapRef.current;
    if (!map) return;
    if (pinMarkerRef.current) {
      pinMarkerRef.current.setLatLng([latlng.lat, latlng.lng]);
      return;
    }
    const L = (window as any).L;
    pinMarkerRef.current = L.marker([latlng.lat, latlng.lng], {
      icon: pinIconRef.current,
      interactive: false,
    }).addTo(map);
  }, []);

  // Create the map when open + Leaflet ready; tear it down when closed so the
  // next open always gets a fresh, correctly-centered instance.
  useEffect(() => {
    if (!isOpen || !leafletLoaded || !containerRef.current) return;
    const L = (window as any).L;
    const initLoc = initialLocationRef.current;
    const fbCenter = fallbackCenterRef.current;
    let center: [number, number] = DEFAULT_CENTER;
    if (initLoc?.kind === 'gps') center = [initLoc.lat, initLoc.lng];
    else if (fbCenter) center = fbCenter;

    let map: any;
    try {
      map = L.map(containerRef.current, { zoomControl: false }).setView(center, 13);
    } catch (err) {
      console.error('Failed to create map:', err);
      setLeafletFailed(true);
      showToast('Error setting up the map.');
      return;
    }

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(DARK_THEMES.has(getActiveTheme()) ? DARK_TILE_URL : TILE_URL, {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    const icon = L.divIcon({
      className: 'map-picker-pin',
      html: PIN_HTML,
      iconSize: [30, 36],
      iconAnchor: [15, 34],
    });
    pinIconRef.current = icon;

    // The pin is created lazily — the map starts blank so the user knows to
    // place it. Editing an existing pin shows it at its current spot.
    if (initLoc?.kind === 'gps') {
      placePinAt({ lat: initLoc.lat, lng: initLoc.lng });
      pinnedRef.current = { lat: initLoc.lat, lng: initLoc.lng };
      setPinnedNow(true);
    }

    // Tap-to-place: tapping the map drops the pin at that exact spot.
    map.on('click', (e: any) => {
      setShowResults(false);
      setNoMatches(false);
      pinnedRef.current = { lat: e.latlng.lat, lng: e.latlng.lng };
      placePinAt(e.latlng);
      setPinnedNow(true);
      fillNameFromPin(e.latlng.lat, e.latlng.lng);
    });
    map.on('dragstart', () => setShowResults(false));

    mapRef.current = map;

    return () => {
      try { map.remove(); } catch (_) { /* already removed */ }
      if (mapRef.current === map) mapRef.current = null;
      pinMarkerRef.current = null;
    };
    // showToast is stable for the picker's lifetime; recreating the map on a
    // toast identity change would be wrong, so it is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, leafletLoaded]);

  // Focus search when the picker opens with the map ready.
  useEffect(() => {
    if (isOpen && leafletLoaded) searchInputRef.current?.focus();
  }, [isOpen, leafletLoaded]);

  // Escape closes the picker.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); handleClose(onClose); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Geocode via Nominatim (India-biased, shared helper): a request-sequence
  // guard stops a slow older response from overwriting a newer one, and a
  // timeout stops the spinner hanging on a stalled network.
  const geocode = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setShowResults(false);
      return;
    }
    if (trimmed === lastSearchedRef.current) return;
    lastSearchedRef.current = trimmed;

    const seq = ++searchSeqRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    setSearching(true);
    try {
      const mapped = await geocodePlace(trimmed, controller.signal);
      if (searchSeqRef.current !== seq) return;
      setResults(mapped);
      setShowResults(mapped.length > 0);
      setNoMatches(mapped.length === 0);
    } catch (err) {
      if (searchSeqRef.current === seq) {
        setResults([]);
        setShowResults(false);
        setNoMatches(false);
      }
    } finally {
      clearTimeout(timer);
      if (searchSeqRef.current === seq) setSearching(false);
    }
  };

  // Debounced search on input
  const handleSearchInput = (value: string) => {
    setQuery(value);
    setShowResults(false);
    setNoMatches(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < MIN_QUERY_LEN) {
      setResults([]);
      lastSearchedRef.current = '';
      return;
    }

    debounceRef.current = window.setTimeout(() => geocode(value), DEBOUNCE_MS);
  };

  // Pan the map to a geocoded result, place the pin there, and adopt its name.
  const handleSelectResult = (r: GeocodePlace) => {
    const map = mapRef.current;
    if (map) map.setView([r.lat, r.lng], 14);
    pinnedRef.current = { lat: r.lat, lng: r.lng };
    placePinAt({ lat: r.lat, lng: r.lng });
    setPinnedNow(true);
    setNameValue(r.name);
    setQuery(r.name);
    setShowResults(false);
    setResults([]);
    setNoMatches(false);
    lastSearchedRef.current = '';
  };

  if (!isOpen) return null;

  const handleConfirm = (e: MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      if (!mapRef.current) return;
      if (!pinnedRef.current) return;
      onConfirm(pinnedRef.current, nameValue.trim());
      handleClose(onClose);
    } catch (err) {
      console.error('Failed to confirm map picker pin:', err);
      showToast('Error setting coordinates from map.');
      handleClose(onClose);
    }
  };

  const handleKeepAsLabel = () => {
    onConfirm(null, nameValue.trim());
    handleClose(onClose);
  };

  return (
    <div class={`modal-backdrop${closing ? ' closing' : ''}`} style={{ zIndex: 3000 }} onClick={() => handleClose(onClose)}>
      <div
        class={`modal-content${closing ? ' closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        style={{ padding: 0, overflow: 'hidden auto', maxHeight: '100%', width: '100%', maxWidth: '480px' }}
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
        <div style={{ position: 'relative', width: '100%', height: 'min(420px, 60vh)' }}>
          {!leafletLoaded && !leafletFailed ? (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--color-paper-dim)',
              fontFamily: 'var(--font-typewriter)', fontSize: '13px',
            }}>
              Loading map...
            </div>
          ) : leafletFailed ? (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px',
              background: 'var(--color-paper-dim)',
              fontFamily: 'var(--font-typewriter)', fontSize: '13px',
            }}>
              <p style={{ margin: 0 }}>Couldn't load the map. Check your connection.</p>
              <Button variant="secondary" size="sm" onClick={() => setLoadAttempt(a => a + 1)}>Retry</Button>
            </div>
          ) : (
            <div
              ref={containerRef}
              style={{ width: '100%', height: '100%', background: 'var(--color-paper-dim)' }}
            />
          )}

          {/* Search bar — floats on top of the map */}
          {leafletLoaded && !leafletFailed && (
            <div style={{ position: 'absolute', top: '12px', left: '12px', right: '12px', zIndex: 2200 }}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  class="search-input"
                  aria-label="Search for a place"
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
                  <span class="search-spinner search-bar-spinner" aria-hidden="true" />
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

              {/* Search in flight — a visible row so the user knows it's running */}
              {searching && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-ink-muted)',
                  borderTop: 'none',
                  borderRadius: '0 0 var(--border-radius) var(--border-radius)',
                  padding: '8px 12px',
                  fontFamily: 'var(--font-typewriter)', fontSize: '12px',
                  color: 'var(--color-ink-muted)',
                }}>
                  <span class="search-spinner" aria-hidden="true" />
                  Searching…
                </div>
              )}

              {/* Search found nothing — the reliable path is tap-to-place */}
              {noMatches && (
                <div style={{
                  background: 'var(--color-paper)',
                  border: '1px solid var(--color-ink-muted)',
                  borderTop: 'none',
                  borderRadius: '0 0 var(--border-radius) var(--border-radius)',
                  padding: '8px 12px',
                  boxShadow: '2px 2px 0px var(--color-shadow)',
                  fontFamily: 'var(--font-typewriter)', fontSize: '12px',
                  color: 'var(--color-ink-muted)',
                }}>
                  No matches — tap the map to drop the pin.
                </div>
              )}

            </div>
          )}

          {/* Map-bottom hint: waiting vs placed — direct children of the map
              wrapper so they sit over the map, never the search bar */}
          {!pinnedNow && (
            <div style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '24px',
              width: 'max-content', maxWidth: 'calc(100% - 24px)',
              background: 'color-mix(in srgb, var(--color-paper) 85%, transparent)',
              border: '1px dashed var(--color-ink-muted)',
              borderRadius: 'var(--border-radius-sm)',
              padding: '6px 10px',
              textAlign: 'center',
              fontFamily: 'var(--font-typewriter)', fontSize: '12px',
              color: 'var(--color-ink-muted)',
              pointerEvents: 'none', zIndex: 2100,
            }}>
              Tap the map to place the pin
            </div>
          )}

          {/* Pin placed — reassure before confirming */}
          {pinnedNow && (
            <div style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '24px',
              width: 'max-content', maxWidth: 'calc(100% - 24px)',
              background: 'color-mix(in srgb, var(--color-paper) 85%, transparent)',
              border: '1px dashed var(--color-ink-muted)',
              borderRadius: 'var(--border-radius-sm)',
              padding: '6px 10px',
              textAlign: 'center',
              fontFamily: 'var(--font-typewriter)', fontSize: '12px',
              color: 'var(--color-ink)',
              pointerEvents: 'none', zIndex: 2100,
            }}>
              Pin placed — confirm below.
            </div>
          )}
        </div>

        {/* Actions */}
        <FieldCard label="Stop name">
          <input
            type="text"
            class="form-input form-input-sm"
            aria-label="Stop name"
            placeholder="Stop name (e.g. Jispa)"
            value={nameValue}
            onInput={(e) => setNameValue((e.target as HTMLInputElement).value)}
          />

          {!pinnedNow && nameValue.trim() && (
            <span class="field-tip" style={{ marginTop: 'var(--spacing-xs)' }}>Add without a pin to keep it as an approximate stop.</span>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap', marginTop: 'var(--spacing-md)' }}>
            <Button variant="secondary" size="sm" onClick={() => handleClose(onClose)}>
              Cancel
            </Button>
            {!pinnedNow && nameValue.trim() && (
              <Button variant="secondary" size="sm" onClick={handleKeepAsLabel}>
                Add without a pin
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleConfirm} disabled={!leafletLoaded || leafletFailed || !pinnedNow}>
              Confirm Location
            </Button>
          </div>
        </FieldCard>
      </div>
    </div>
  );
}
