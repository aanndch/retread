import type { LocationUnion } from '../../types';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { PinIcon } from '../../components/icons';

interface MetricsStepProps {
  mode: 'new-trip' | 'new-day' | 'edit';
  tripTitle: string;
  setTripTitle: (t: string) => void;
  date: string;
  setDate: (d: string) => void;
  km: number | null;
  setKm: (k: number | null) => void;
  odo: number | null;
  setOdo: (o: number | null) => void;
  location: LocationUnion | null;
  gpsLoading: boolean;
  handleDropPin: () => void;
  showNamedFallback: boolean;
  tempPlaceName: string;
  handlePlaceNameChange: (n: string) => void;
  handleClearLocation: () => void;
  dayTitle: string;
  setDayTitle: (t: string) => void;
  distanceMode: 'both' | 'km' | 'odo';
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  showStartNamedFallback: boolean;
  tempStartPlaceName: string;
  onStartPlaceNameChange: (n: string) => void;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  titleError: string;
  setTitleError: (e: string) => void;
  handleCancel: () => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
}

export function MetricsStep({
  mode,
  tripTitle,
  setTripTitle,
  date,
  setDate,
  km,
  setKm,
  odo,
  setOdo,
  location,
  gpsLoading,
  handleDropPin,
  showNamedFallback,
  tempPlaceName,
  handlePlaceNameChange,
  handleClearLocation,
  dayTitle,
  setDayTitle,
  distanceMode,
  startLocation,
  startGpsLoading,
  showStartNamedFallback,
  tempStartPlaceName,
  onStartPlaceNameChange,
  onClearStartLocation,
  onRetryStartGps,
  titleError,
  setTitleError,
  handleCancel,
  handleStepJump
}: MetricsStepProps) {
  return (
    <div class="wizard-step-content">
      {/* Trip Title (New Trip Only) */}
      {mode === 'new-trip' && (
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

      {/* Starting From - Departure Pin (New Trip Only) */}
      {mode === 'new-trip' && (
        <div class="form-group">
          <label class="input-label">Starting From</label>
          {startGpsLoading ? (
            <span class="field-tip">📡 Detecting your location...</span>
          ) : startLocation ? (
            <div class="geo-pinned-display">
              <span class="pinned-text">
                📍 {startLocation.kind === 'gps'
                  ? (startLocation.name || `[${startLocation.lat.toFixed(4)}, ${startLocation.lng.toFixed(4)}]`)
                  : startLocation.name}
              </span>
              <Button variant="icon" class="action-tiny" aria-label="Clear start location" onClick={onClearStartLocation}>×</Button>
            </div>
          ) : showStartNamedFallback ? (
            <div class="form-row">
              <input 
                type="text" 
                class="form-input" 
                placeholder="Type starting city/town" 
                value={tempStartPlaceName} 
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => onStartPlaceNameChange((e.target as HTMLInputElement).value)}
              />
              <Button variant="secondary" size="sm" onClick={onRetryStartGps}>
                <PinIcon size={14} /> Retry GPS
              </Button>
            </div>
          ) : (
            <div class="form-row">
              <Button variant="secondary" size="sm" onClick={onRetryStartGps}>
                <PinIcon size={14} /> Drop Pin
              </Button>
              <span class="field-tip">Auto-detect failed. Tap to retry or type manually.</span>
            </div>
          )}
        </div>
      )}

      {/* Row 1: Day Label (Whole Row) */}
      <div class="form-group">
        <label class="input-label">Day Label / Route Leg</label>
        <input 
          type="text" 
          class="form-input" 
          placeholder="e.g. Manali to Jispa" 
          value={dayTitle} 
          onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => setDayTitle((e.target as HTMLInputElement).value)}
        />
      </div>

      {/* Row 2: Date and KM / Odo Selector */}
      <div class="form-row">
        <div class="form-group flex-1">
          <label class="input-label">Date</label>
          <input 
            type="date" 
            class="form-input" 
            required 
            value={date} 
            onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => setDate((e.target as HTMLInputElement).value)}
          />
        </div>

        {distanceMode !== 'odo' && (
          <div class="form-group flex-1">
            <label class="input-label">Daily Distance (KM)</label>
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
      {distanceMode === 'both' && (
        <span class="field-tip">Pick one per ride — km for daily distance, odo for odometer.</span>
      )}

      {/* Geolocation Section */}
      <div class="form-group-inline">
        <label class="input-label" style={{ marginBottom: 0 }}>Location Pin</label>
        
        {!location && !showNamedFallback ? (
          <Button 
            variant="secondary" 
            size="sm"
            class="btn-icon-text"
            onClick={handleDropPin}
            disabled={gpsLoading}
          >
            <PinIcon class="location-pin-icon" />
            <span>{gpsLoading ? 'Locating...' : 'Drop Pin'}</span>
          </Button>
        ) : (
          <div class="location-status">
            {location?.kind === 'gps' && (
              <div class="location-coord">
                <span class="geo-badge">GPS</span>
                <span>[{location.lat.toFixed(4)}, {location.lng.toFixed(4)}]</span>
              </div>
            )}
            
            <div class="location-input-row">
              <input 
                type="text" 
                class="form-input form-input-sm" 
                placeholder="Place name"
                value={tempPlaceName}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => handlePlaceNameChange((e.target as HTMLInputElement).value)}
              />
              <button type="button" class="btn-clear" aria-label="Clear location" onClick={handleClearLocation}>&times;</button>
            </div>
          </div>
        )}
      </div>

      {/* Step 1 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => handleStepJump(2)}>
          Next: Photos →
        </Button>
      </div>
    </div>
  );
}
