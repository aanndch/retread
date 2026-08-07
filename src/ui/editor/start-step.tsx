import { FieldCard } from '../../components/field-card';
import { PlaceRow, TextInput, StepActions } from './fields';
import type { LocationUnion } from '../../types';

interface StartStepProps {
  rideTitle: string;
  setRideTitle: (t: string) => void;
  // Preview of the auto-derived ride title (leg date).
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
  handleStepJump: (s: 1 | 2 | 3 | 4 | 5) => void;
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
  return (
    <div class="wizard-step-content">
      <div class="ride-create-body">
        <FieldCard label="Name your ride">
          <TextInput
            placeholder={autoRideTitle || "e.g. Spiti Valley Odyssey"}
            value={rideTitle}
            onInput={setRideTitle}
            error={titleError}
            onClearError={() => setTitleError('')}
          />
        </FieldCard>

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
      </div>

      <StepActions
        onBack={handleCancel}
        backLabel="Cancel"
        backDisabled={saving}
        onNext={() => handleStepJump(2)}
        nextLabel="Next: Stop →"
        nextDisabled={saving}
      />
    </div>
  );
}
