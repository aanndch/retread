import type { LocationUnion } from '../../types';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { PinIcon } from '../../components/icons';

interface MetricsStepProps {
  mode: 'new-trip' | 'edit-trip' | 'new-day' | 'edit';
  tripTitle: string;
  setTripTitle: (t: string) => void;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  km: number | null;
  setKm: (k: number | null) => void;
  odo: number | null;
  setOdo: (o: number | null) => void;
  location: LocationUnion | null;
  setLocation: (l: LocationUnion | null) => void;
  gpsLoading: boolean;
  handleDropPin: () => void;
  handleClearLocation: () => void;
  dayTitle: string;
  setDayTitle: (t: string) => void;
  distanceMode: 'auto' | 'manual' | 'odo';
  setDistanceMode: (m: 'auto' | 'manual' | 'odo') => void;
  startOdo: number | null;
  setStartOdo: (o: number | null) => void;
  startLocation: LocationUnion | null;
  setStartLocation: (l: LocationUnion | null) => void;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  titleError: string;
  setTitleError: (e: string) => void;
  handleCancel: () => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
  onOpenMapPicker: (target: 'start' | 'location') => void;
  fallbackCenter: [number, number] | null;
  onAutoFillDistance: () => void;
}

export function MetricsStep({
  mode,
  tripTitle,
  setTripTitle,
  date,
  setDate,
  time,
  setTime,
  km,
  setKm,
  odo,
  setOdo,
  location,
  setLocation,
  gpsLoading,
  handleDropPin,
  handleClearLocation,
  dayTitle,
  setDayTitle,
  distanceMode,
  setDistanceMode,
  startOdo,
  setStartOdo,
  startLocation,
  setStartLocation,
  startGpsLoading,
  onClearStartLocation,
  onRetryStartGps,
  titleError,
  setTitleError,
  handleCancel,
  handleStepJump,
  onOpenMapPicker,
  fallbackCenter,
  onAutoFillDistance
}: MetricsStepProps) {
  return (
    <div class="wizard-step-content">
      {/* Trip Title (New Trip Only) */}
      {(mode === 'new-trip' || mode === 'edit-trip') && (
        <div class="form-group">
          <label class="input-label">Ride Title</label>
          <input 
            type="text" 
            class={`form-input ${titleError ? 'input-error' : ''}`}
            placeholder="e.g. Spiti Valley Odyssey" 
            value={tripTitle}
            onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
              setTripTitle((e.target as HTMLInputElement).value);
              if ((e.target as HTMLInputElement).value.trim()) setTitleError('');
            }}
          />
          {titleError && <span class="error-text">{titleError}</span>}
        </div>
      )}

      {/* Starting From - Departure Pin (New Trip / Edit Trip) */}
      {(mode === 'new-trip' || mode === 'edit-trip') && (
        <div class="form-group">
          <label class="input-label">Starting From</label>
          
          {/* Starting Location Name text input */}
          <div class="form-group" style={{ marginBottom: '8px' }}>
            <input 
              type="text" 
              class="form-input form-input-sm" 
              placeholder="Starting place name (e.g. Delhi)" 
              value={startLocation ? startLocation.name : ''}
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                const val = (e.target as HTMLInputElement).value;
                if (!startLocation) {
                  if (val) setStartLocation({ kind: 'named', name: val });
                } else if (startLocation.kind === 'named') {
                  if (val) setStartLocation({ kind: 'named', name: val });
                  else setStartLocation(null);
                } else {
                  setStartLocation({ ...startLocation, name: val });
                }
              }}
            />
          </div>

          {/* Coordinate Pin Selection */}
          {startGpsLoading ? (
            <span class="field-tip">📡 Detecting your location...</span>
          ) : startLocation?.kind === 'gps' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'var(--color-paper-dim)', padding: '6px 12px', borderRadius: 'var(--border-radius)', border: '1px solid var(--color-ink-muted)' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                📍 [{startLocation.lat.toFixed(4)}, {startLocation.lng.toFixed(4)}]
              </span>
              <button 
                type="button" 
                onClick={onClearStartLocation}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '0 4px', color: 'var(--color-ink-muted)' }}
              >
                &times;
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'row' }}>
              <Button 
                variant="secondary" 
                size="sm" 
                style={{ flex: 1 }}
                onClick={onRetryStartGps}
              >
                <PinIcon size={14} /> Detect GPS
              </Button>
              <Button 
                type="button"
                variant="secondary" 
                size="sm" 
                style={{ flex: 1 }}
                onClick={() => onOpenMapPicker('start')}
              >
                🗺 Pick on Map
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Distance Tracking Preference (New Trip / Edit Trip) */}
      {(mode === 'new-trip' || mode === 'edit-trip') && (
        <div class="form-group animate-fade-in" style={{ marginTop: 'var(--spacing-md)' }}>
          <label class="input-label">Distance Tracking Method</label>
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column', marginBottom: '8px' }}>
            <Button
              type="button"
              variant={distanceMode === 'auto' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setDistanceMode('auto')}
            >
              Auto from GPS
            </Button>
            <Button
              type="button"
              variant={distanceMode === 'manual' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setDistanceMode('manual')}
            >
              Manual (km)
            </Button>
            <Button
              type="button"
              variant={distanceMode === 'odo' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setDistanceMode('odo')}
            >
              Odometer Readings
            </Button>
          </div>

          {distanceMode === 'auto' && (
            <span class="field-tip">Distance is auto-calculated from the road route between your GPS pins each leg.</span>
          )}

          {distanceMode === 'manual' && (
            <span class="field-tip">You'll type the distance travelled for each leg.</span>
          )}

          {distanceMode === 'odo' && (
            <div class="form-group animate-fade-in" style={{ marginTop: '8px' }}>
              <label class="input-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Starting Odometer (km)</label>
              <input
                type="number"
                class="form-input form-input-sm"
                placeholder="e.g. 5240"
                value={startOdo === null ? '' : startOdo}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                  const val = (e.target as HTMLInputElement).value;
                  setStartOdo(val ? parseFloat(val) : null);
                }}
              />
              <span class="field-tip">Record the odometer at each stop. Starting reading anchors Day 1.</span>
            </div>
          )}
        </div>
      )}

      {/* Leg page metrics (Only for Leg creation or Leg edit modes) */}
      {(mode === 'new-day' || mode === 'edit') && (
        <>
          {/* Row 1: Leg Route (Whole Row) */}
          <div class="form-group">
            <label class="input-label">Route Name</label>
            <input 
              type="text" 
              class="form-input" 
              placeholder="e.g. Manali to Jispa" 
              value={dayTitle} 
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setDayTitle((e.target as HTMLInputElement).value)}
            />
          </div>

          {/* Row 2: Date/Time and Odometer */}
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="input-label">Date & Time</label>
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'row' }}>
                <input 
                  type="date" 
                  class="form-input" 
                  required 
                  style={{ flex: 1.8 }}
                  value={date} 
                  onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => setDate((e.target as HTMLInputElement).value)}
                />
                <input 
                  type="time" 
                  class="form-input" 
                  required 
                  style={{ flex: 1.2 }}
                  value={time || ''} 
                  onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => setTime((e.target as HTMLInputElement).value)}
                />
              </div>
            </div>

            {distanceMode === 'odo' && (
              <div class="form-group flex-1">
                <label class="input-label">Odometer</label>
                <input 
                  type="number" 
                  class="form-input" 
                  placeholder="e.g. 14320"
                  value={odo === null ? '' : odo}
                  onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setOdo((e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null)}
                />
              </div>
            )}
          </div>

          {/* Row 3: Distance Travelled (own row) */}
          {distanceMode !== 'odo' && (
            <div class="form-group">
              <label class="input-label">Distance Travelled (KM)</label>
              <input 
                type="number" 
                class="form-input" 
                placeholder="e.g. 120"
                value={km === null ? '' : km}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setKm((e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null)}
              />
              {fallbackCenter && location?.kind === 'gps' && (
                <button
                  type="button"
                  class="btn-calc-link"
                  onClick={onAutoFillDistance}
                  disabled={gpsLoading}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style={{ display: 'inline-block', marginRight: '4px' }}>
                    <circle cx="5" cy="19" r="2.5" />
                    <path d="M7 17c6-8-2-10 11-11" />
                    <path d="M14 2l8 8M22 2l-8 8" />
                  </svg>
                  <span>{gpsLoading ? 'Calculating...' : 'Auto-calculate distance'}</span>
                </button>
              )}
            </div>
          )}


          {/* Geolocation Section */}
          <div class="form-group form-group-bordered">
            <label class="input-label">End Point</label>
            
            {/* Destination Name Text Input */}
            <div class="form-group" style={{ marginBottom: '8px' }}>
              <input 
                type="text" 
                class="form-input form-input-sm" 
                placeholder="Destination name (e.g. Jispa)" 
                value={location ? location.name : ''}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                  const val = (e.target as HTMLInputElement).value;
                  if (!location) {
                    if (val) setLocation({ kind: 'named', name: val });
                  } else if (location.kind === 'named') {
                    if (val) setLocation({ kind: 'named', name: val });
                    else setLocation(null);
                  } else {
                    setLocation({ ...location, name: val });
                  }
                }}
              />
            </div>

            {/* Coordinate Pin selection/badge */}
            {gpsLoading ? (
              <span class="field-tip">📡 Detecting your location...</span>
            ) : location?.kind === 'gps' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'var(--color-paper-dim)', padding: '6px 12px', borderRadius: 'var(--border-radius)', border: '1px solid var(--color-ink-muted)' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-ink)' }}>
                  📍 [{location.lat.toFixed(4)}, {location.lng.toFixed(4)}]
                </span>
                <button 
                  type="button" 
                  onClick={handleClearLocation}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '0 4px', color: 'var(--color-ink-muted)' }}
                >
                  &times;
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'row' }}>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  style={{ flex: 1 }}
                  onClick={handleDropPin}
                >
                  <PinIcon size={14} /> Detect GPS
                </Button>
                <Button 
                  type="button"
                  variant="secondary" 
                  size="sm" 
                  style={{ flex: 1 }}
                  onClick={() => onOpenMapPicker('location')}
                >
                  🗺 Pick on Map
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Step 1 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
        {mode === 'new-trip' || mode === 'edit-trip' ? (
          <Button type="submit" variant="primary">
            {mode === 'new-trip' ? 'Create Ride' : 'Save Changes'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => handleStepJump(2)}>
            Next: Photos →
          </Button>
        )}
      </div>
    </div>
  );
}
