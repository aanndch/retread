import type { LocationUnion } from '../../types';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { PinIcon, MapIcon } from '../../components/icons';
import { formatDistance } from '../../lib';

// Friendly chip for a GPS pin: shows the place name (or "Pin set") with the
// raw coordinates kept small and dim so the location stays verifiable.
function GpsBadge({ name, lat, lng, onClear }: { name?: string; lat: number; lng: number; onClear: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        background: 'var(--color-paper-dim)',
        padding: '6px 12px',
        borderRadius: 'var(--border-radius)',
        border: '1px solid var(--color-ink-muted)',
      }}
    >
      <span style={{ fontSize: '13px', color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
        <span>📍</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'Pin set'}</span>
        <span style={{ opacity: 0.55, fontSize: '11px', flexShrink: 0 }}>{lat.toFixed(4)}, {lng.toFixed(4)}</span>
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear location pin"
        style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '0 4px', color: 'var(--color-ink-muted)', flexShrink: 0 }}
      >
        &times;
      </button>
    </div>
  );
}

interface MetricsStepProps {
  mode: 'new-ride' | 'edit-ride' | 'new-leg' | 'edit';
  rideTitle: string;
  setRideTitle: (t: string) => void;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  km: number | null;
  onKmChange: (k: number | null) => void;
  kmSource: 'auto' | 'manual' | null;
  distanceFromLabel: string | null;
  location: LocationUnion | null;
  setLocation: (l: LocationUnion | null) => void;
  gpsLoading: boolean;
  handleDropPin: () => void;
  handleClearLocation: () => void;
  // Set when the user tried to advance without a pin; surfaces the "no map pin"
  // note so the implicit bypass is a conscious choice.
  mapNote: boolean;
  legTitle: string;
  setLegTitle: (t: string) => void;
  distanceMode: 'auto' | 'manual';
  setDistanceMode: (m: 'auto' | 'manual') => void;
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
  saving: boolean;
}

export function MetricsStep({
  mode,
  rideTitle,
  setRideTitle,
  date,
  setDate,
  time,
  setTime,
  km,
  onKmChange,
  kmSource,
  distanceFromLabel,
  location,
  setLocation,
  gpsLoading,
  handleDropPin,
  handleClearLocation,
  mapNote,
  legTitle,
  setLegTitle,
  distanceMode,
  setDistanceMode,
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
  onAutoFillDistance,
  saving
}: MetricsStepProps) {
  return (
    <div class="wizard-step-content">
      {/* Ride Title (New Ride Only) */}
      {(mode === 'new-ride' || mode === 'edit-ride') && (
        <div class="form-group">
          <label class="input-label">Ride Title</label>
          <input 
            type="text" 
            class={`form-input ${titleError ? 'input-error' : ''}`}
            placeholder="e.g. Spiti Valley Odyssey" 
            value={rideTitle}
            onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
              setRideTitle((e.target as HTMLInputElement).value);
              if ((e.target as HTMLInputElement).value.trim()) setTitleError('');
            }}
          />
          {titleError && <span class="error-text">{titleError}</span>}
        </div>
      )}

      {/* Starting From - Departure Pin (New Ride / Edit Ride) */}
      {(mode === 'new-ride' || mode === 'edit-ride') && (
        <div class="form-group">
          <label class="input-label">Starting From</label>
          <span class="field-tip">Name it, then drop a pin to draw the route.</span>

          {/* Starting Location Name text input (optional label) */}
          <div class="form-group" style={{ marginBottom: '8px' }}>
            <input 
              type="text" 
              class="form-input form-input-sm" 
              placeholder="Label the start (optional)" 
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
            <GpsBadge
              name={startLocation.name}
              lat={startLocation.lat}
              lng={startLocation.lng}
              onClear={onClearStartLocation}
            />
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'row' }}>
              <Button
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                onClick={onRetryStartGps}
              >
                <PinIcon size={14} /> Use my location
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                onClick={() => onOpenMapPicker('start')}
              >
                <MapIcon size={14} /> Pick on Map
              </Button>
            </div>
          )}

          {mapNote && startLocation?.kind !== 'gps' && (
            <span class="field-tip">No start pin — your route will begin at the first pinned stop.</span>
          )}
        </div>
      )}

      {/* Distance Tracking Preference (New Ride / Edit Ride) */}
      {(mode === 'new-ride' || mode === 'edit-ride') && (
        <div class="form-group animate-fade-in" style={{ marginTop: 'var(--spacing-md)' }}>
          <label class="input-label">Distance Method</label>
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column', marginBottom: '8px' }}>
            <Button
              type="button"
              variant={distanceMode === 'auto' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setDistanceMode('auto')}
            >
              GPS route
            </Button>
            <Button
              type="button"
              variant={distanceMode === 'manual' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setDistanceMode('manual')}
            >
              Manual
            </Button>
          </div>

          {distanceMode === 'auto' && (
            <span class="field-tip">We measure each leg between your GPS pins, along real roads.</span>
          )}

          {distanceMode === 'manual' && (
            <span class="field-tip">You type the distance for each leg.</span>
          )}
        </div>
      )}

      {/* Leg metrics (Only for Leg creation or Leg edit modes) */}
      {(mode === 'new-leg' || mode === 'edit') && (
        <>
          {/* Row 1: Leg Route (Whole Row) */}
          <div class="form-group">
            <label class="input-label">Leg Title</label>
            <input 
              type="text" 
              class={`form-input ${titleError ? 'input-error' : ''}`}
              placeholder="e.g. Manali to Jispa" 
              value={legTitle} 
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                setLegTitle((e.target as HTMLInputElement).value);
                if ((e.target as HTMLInputElement).value.trim()) setTitleError('');
              }}
            />
            {titleError && <span class="error-text">{titleError}</span>}
          </div>

          {/* Row 2: Date/Time */}
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
          </div>

          {/* Row 3: Destination (location before distance so auto-calc has a target) */}
          <div class="form-group">
            <label class="input-label">Destination</label>
            <span class="field-tip">Name it, then drop a pin to draw the route.</span>

            {/* Destination Name Text Input (optional label, shown first for catch-up users) */}
            <div class="form-group" style={{ marginBottom: '8px' }}>
              <input 
                type="text" 
                class="form-input form-input-sm" 
                placeholder="Label this stop (optional)" 
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
              <GpsBadge
                name={location.name}
                lat={location.lat}
                lng={location.lng}
                onClear={handleClearLocation}
              />
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'row' }}>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  style={{ flex: 1 }}
                  onClick={handleDropPin}
                >
                  <PinIcon size={14} /> Use my location
                </Button>
                <Button 
                  type="button"
                  variant="secondary" 
                  size="sm" 
                  style={{ flex: 1 }}
                  onClick={() => onOpenMapPicker('location')}
                >
                  <MapIcon size={14} /> Pick on Map
                </Button>
              </div>
            )}

            {mapNote && location?.kind !== 'gps' && (
              <span class="field-tip">No map pin — this leg won't appear on the route map.</span>
            )}
          </div>

          {/* Row 4: Distance — method toggle plus its field, always visible */}
          <div class="form-group" style={{ marginTop: 'var(--spacing-md)' }}>
            <label class="input-label">Distance</label>
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'row', marginBottom: '8px' }}>
              <Button
                type="button"
                variant={distanceMode === 'auto' ? 'primary' : 'secondary'}
                size="sm"
                style={{ flex: 1 }}
                onClick={() => setDistanceMode('auto')}
              >
                GPS route
              </Button>
              <Button
                type="button"
                variant={distanceMode === 'manual' ? 'primary' : 'secondary'}
                size="sm"
                style={{ flex: 1 }}
                onClick={() => setDistanceMode('manual')}
              >
                Manual
              </Button>
              <Button
                type="button"
                variant={distanceMode === 'manual' ? 'primary' : 'secondary'}
                size="sm"
                style={{ flex: 1 }}
                onClick={() => setDistanceMode('manual')}
              >
                Manual
              </Button>
            </div>

            <div class="form-group animate-fade-in">
              {distanceMode === 'auto' && (
                fallbackCenter && location?.kind === 'gps' ? (
                  <span class="field-tip">Measured between this leg's pins along real roads.</span>
                ) : location?.kind === 'gps' ? (
                  <span class="field-tip">There's no GPS start point before this leg — type it below, or switch to Manual.</span>
                ) : (
                  <span class="field-tip">Set this leg's destination GPS pin to measure the route — or type it below.</span>
                )
              )}
              {distanceMode === 'manual' && (
                <span class="field-tip">Just type how far this leg was.</span>
              )}
              <label class="input-label">Distance (km)</label>
              <input 
                type="number" 
                class="form-input" 
                placeholder="e.g. 118"
                value={km === null ? '' : km}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => onKmChange((e.target as HTMLInputElement).value ? parseFloat((e.target as HTMLInputElement).value) : null)}
              />
              {distanceMode === 'auto' && fallbackCenter && location?.kind === 'gps' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                  {km !== null && km !== undefined && !gpsLoading && (
                    <span class="field-tip">
                      ≈ {formatDistance(km)} · {distanceFromLabel ? `${distanceFromLabel} → ` : '→ '}{location.name || 'destination'}
                    </span>
                  )}
                  {gpsLoading && <span class="field-tip">Calculating route…</span>}
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
                    <span>{gpsLoading ? 'Measuring…' : 'Recalculate'}</span>
                  </button>
                </div>
              )}
              {distanceMode === 'auto' && kmSource === 'manual' && km !== null && km !== undefined && (
                <span class="field-tip">You entered this — tap Recalculate to re-measure.</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Step 1 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        {mode === 'new-ride' || mode === 'edit-ride' ? (
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : mode === 'new-ride' ? 'Create Ride' : 'Save Changes'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => handleStepJump(2)} disabled={saving}>
            Next: Photos →
          </Button>
        )}
      </div>
    </div>
  );
}
