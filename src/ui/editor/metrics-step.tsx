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
  gpsLoading: boolean;
  handleDropPin: () => void;
  handleClearLocation: () => void;
  dayTitle: string;
  setDayTitle: (t: string) => void;
  distanceMode: 'km' | 'odo';
  setDistanceMode: (m: 'km' | 'odo') => void;
  startOdo: number | null;
  setStartOdo: (o: number | null) => void;
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  titleError: string;
  setTitleError: (e: string) => void;
  handleCancel: () => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
  onOpenMapPicker: (target: 'start' | 'dest') => void;
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
  startGpsLoading,
  onClearStartLocation,
  onRetryStartGps,
  titleError,
  setTitleError,
  handleCancel,
  handleStepJump,
  onOpenMapPicker
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
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'row', marginBottom: '8px' }}>
            <Button
              type="button"
              variant={distanceMode === 'km' ? 'primary' : 'secondary'}
              size="sm"
              style={{ flex: 1 }}
              onClick={() => setDistanceMode('km')}
            >
              Daily km Traveled
            </Button>
            <Button
              type="button"
              variant={distanceMode === 'odo' ? 'primary' : 'secondary'}
              size="sm"
              style={{ flex: 1 }}
              onClick={() => setDistanceMode('odo')}
            >
              Odometer Readings
            </Button>
          </div>
          
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
              <span class="field-tip">Required to calculate Day 1 distance travelled.</span>
            </div>
          )}
        </div>
      )}

      {/* Leg page metrics (Only for Leg creation or Leg edit modes) */}
      {(mode === 'new-day' || mode === 'edit') && (
        <>
          {/* Row 1: Leg Route (Whole Row) */}
          <div class="form-group">
            <label class="input-label">Leg Route / Destination</label>
            <input 
              type="text" 
              class="form-input" 
              placeholder="e.g. Manali to Jispa" 
              value={dayTitle} 
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setDayTitle((e.target as HTMLInputElement).value)}
            />
          </div>

          {/* Row 2: Date/Time and KM / Odo Selector */}
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

            {distanceMode !== 'odo' && (
              <div class="form-group flex-1">
                <label class="input-label">Distance Travelled (KM)</label>
                <input 
                  type="number" 
                  class="form-input" 
                  placeholder="e.g. 120"
                  value={km === null ? '' : km}
                  onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setKm((e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null)}
                />
              </div>
            )}

            {distanceMode !== 'km' && (
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


          {/* Geolocation Section */}
          <div class="form-group form-group-bordered">
            <label class="input-label">Location Pin</label>
            
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
                  onClick={() => onOpenMapPicker('dest')}
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
