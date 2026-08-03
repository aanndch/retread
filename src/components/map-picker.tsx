import { useState, useEffect, useRef } from 'preact/hooks';
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
  const pickerMapRef = useRef<any>(null);

  const handleClose = (action: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false); // reset state
      action();
    }, 180);
  };

  // Load Leaflet resources once modal opens
  useEffect(() => {
    let active = true;
    loadLeaflet()
      .then(() => {
        if (active) setLeafletLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load Leaflet library:', err);
        showToast('Failed to load map libraries.');
      });
    return () => {
      active = false;
    };
  }, []);

  // Clean up map instance when modal unmounts
  useEffect(() => {
    return () => {
      if (pickerMapRef.current) {
        try {
          pickerMapRef.current.remove();
        } catch (err) {
          console.warn('Failed to clean up map instance:', err);
        }
        pickerMapRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const initializeMap = (el: HTMLDivElement | null) => {
    if (!el) return;
    if (!(window as any).L) return;
    const L = (window as any).L;

    let initialCenter: [number, number] = [31.1048, 77.1734];
    if (initialLocation?.kind === 'gps') {
      initialCenter = [initialLocation.lat, initialLocation.lng];
    } else if (fallbackCenter) {
      initialCenter = fallbackCenter;
    }

    try {
      if (pickerMapRef.current) {
        pickerMapRef.current.remove();
      }
    } catch (err) {
      console.warn('Failed to remove existing map instance:', err);
    }

    const map = L.map(el, {
      zoomControl: true,
    }).setView(initialCenter, 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    pickerMapRef.current = map;
  };

  const handleConfirm = (e: MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      if (!pickerMapRef.current) {
        console.warn('Map reference is not initialized');
        return;
      }

      const center = pickerMapRef.current.getCenter();
      if (!center || typeof center.lat !== 'number' || typeof center.lng !== 'number') {
        throw new Error('Invalid center coordinates from Map Picker');
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
        <div
          class="map-picker-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px',
            borderBottom: '1px solid var(--color-ink-muted)',
          }}
        >
          <h4 style={{ margin: 0 }}>Pick Location</h4>
          <button
            type="button"
            class="btn-clear"
            onClick={() => handleClose(onClose)}
            style={{
              fontSize: '20px',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              color: 'var(--color-ink)',
            }}
          >
            &times;
          </button>
        </div>

        <div style={{ position: 'relative', width: '100%', height: '350px' }}>
          {!leafletLoaded ? (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-paper-dim)',
                fontFamily: 'var(--font-typewriter)',
                fontSize: '13px',
              }}
            >
              Loading map...
            </div>
          ) : (
            <div
              ref={initializeMap}
              id="picker-map-el"
              style={{ width: '100%', height: '100%', background: 'var(--color-paper-dim)' }}
            ></div>
          )}

          {/* Crosshair indicator in center */}
          {leafletLoaded && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="30"
                height="30"
                viewBox="0 0 30 30"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="15"
                  cy="15"
                  r="4"
                  stroke="var(--color-ink)"
                  stroke-width="2"
                  fill="var(--color-paper)"
                />
                <line x1="15" y1="0" x2="15" y2="10" stroke="var(--color-ink)" stroke-width="2" />
                <line
                  x1="15"
                  y1="20"
                  x2="15"
                  y2="30"
                  stroke="var(--color-ink)"
                  stroke-width="2"
                />
                <line x1="0" y1="15" x2="10" y2="15" stroke="var(--color-ink)" stroke-width="2" />
                <line
                  x1="20"
                  y1="15"
                  x2="30"
                  y2="15"
                  stroke="var(--color-ink)"
                  stroke-width="2"
                />
              </svg>
            </div>
          )}
        </div>

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
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            disabled={!leafletLoaded}
          >
            Confirm Location
          </Button>
        </div>
      </div>
    </div>
  );
}
