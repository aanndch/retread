import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { FieldCard } from '../../components/field-card';
import { DetailRow, PlaceRow } from './fields';
import type { LocationUnion } from '../../types';

interface StartStepProps {
  rideTitle: string;
  setRideTitle: (t: string) => void;
  // Preview of the auto-derived ride title (start label + leg date).
  autoRideTitle: string;
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  onOpenMapPicker: (target: 'start' | 'location') => void;
  mapNote: boolean;
  titleError: string;
  setTitleError: (e: string) => void;
  handleCancel: () => void;
  handleStepJump: (s: 1 | 2 | 3 | 4) => void;
  saving: boolean;
}

// Step 1 of a new ride — the focused "where does this ride begin?" prompt.
export function StartStep({
  rideTitle,
  setRideTitle,
  autoRideTitle,
  startLocation,
  startGpsLoading,
  onClearStartLocation,
  onRetryStartGps,
  onOpenMapPicker,
  mapNote,
  titleError,
  setTitleError,
  handleCancel,
  handleStepJump,
  saving,
}: StartStepProps) {
  const [openTitle, setOpenTitle] = useState(false);

  return (
    <div class="wizard-step-content">
      <div class="ride-create-body">
        <p class="field-tip ride-create-kicker">Where does this ride begin?</p>

        <FieldCard label="Starting From">
          <PlaceRow
            emptyLabel="Choose start →"
            location={startLocation}
            gpsLoading={startGpsLoading}
            onOpen={() => onOpenMapPicker('start')}
            onUseLocation={onRetryStartGps}
            onClear={onClearStartLocation}
          />
          {mapNote && startLocation?.kind !== 'gps' && (
            <span class="field-tip">No start pin — your route will begin at the first pinned stop.</span>
          )}
        </FieldCard>

        <DetailRow
          label="Title"
          value={rideTitle || autoRideTitle}
          open={openTitle}
          onToggle={() => setOpenTitle(!openTitle)}
        >
          <div class="form-group">
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
        </DetailRow>
      </div>

      <div class="form-actions">
        <Button variant="secondary" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => handleStepJump(2)} disabled={saving}>
          Next: Stop →
        </Button>
      </div>
    </div>
  );
}
