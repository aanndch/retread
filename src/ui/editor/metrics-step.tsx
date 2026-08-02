import type { LocationUnion } from '../../types';
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
            onInput={(e: any) => {
              setTripTitle(e.target.value);
              if (e.target.value.trim()) setTitleError('');
            }}
          />
          {titleError && <span class="error-text">{titleError}</span>}
        </div>
      )}

      {/* Date & Day Label Selector */}
      <div class="form-row">
        <div class="form-group flex-1">
          <label class="input-label">Date</label>
          <input 
            type="date" 
            class="form-input" 
            required 
            value={date} 
            onChange={(e: any) => setDate(e.target.value)}
          />
        </div>
        <div class="form-group flex-2">
          <label class="input-label">Day Label / Route Leg</label>
          <input 
            type="text" 
            class="form-input" 
            placeholder="e.g. Manali to Jispa" 
            value={dayTitle} 
            onInput={(e: any) => setDayTitle(e.target.value)}
          />
        </div>
      </div>

      {/* Distance Metrics: KM / Odo */}
      <div class="form-row">
        <div class="form-group flex-1">
          <label class="input-label">Daily Distance (KM)</label>
          <input 
            type="number" 
            class="form-input" 
            placeholder="e.g. 120"
            value={km === null ? '' : km}
            onInput={(e: any) => setKm(e.target.value ? parseFloat(e.target.value) : null)}
          />
        </div>
        <div class="form-group flex-1">
          <label class="input-label">Odometer</label>
          <input 
            type="number" 
            class="form-input" 
            placeholder="e.g. 14320"
            value={odo === null ? '' : odo}
            onInput={(e: any) => setOdo(e.target.value ? parseFloat(e.target.value) : null)}
          />
        </div>
      </div>
      <span class="field-tip">Pick one per ride — km for daily distance, odo for odometer.</span>

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
                onInput={(e: any) => handlePlaceNameChange(e.target.value)}
              />
              <button type="button" class="btn-clear" onClick={handleClearLocation}>&times;</button>
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
