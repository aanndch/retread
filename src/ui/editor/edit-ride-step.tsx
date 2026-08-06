import { FieldCard } from '../../components/field-card';
import { PlaceRow, TextInput, StepActions } from './fields';
import type { LocationUnion } from '../../types';

interface EditRideStepProps {
  rideTitle: string;
  setRideTitle: (t: string) => void;
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  onOpenMapPicker: (target: 'start' | 'location') => void;
  mapNote: boolean;
  titleError: string;
  setTitleError: (e: string) => void;
  handleCancel: () => void;
  saving: boolean;
}

// Single-screen ride metadata edit (no wizard).
export function EditRideStep({
  rideTitle,
  setRideTitle,
  startLocation,
  startGpsLoading,
  onClearStartLocation,
  onRetryStartGps,
  onOpenMapPicker,
  mapNote,
  titleError,
  setTitleError,
  handleCancel,
  saving,
}: EditRideStepProps) {
  return (
    <div class="wizard-step-content">
      <FieldCard label="Ride Title">
        <TextInput
          placeholder="e.g. Spiti Valley Odyssey"
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

      <StepActions
        onBack={handleCancel}
        backLabel="Cancel"
        backDisabled={saving}
        submit
        nextLabel={saving ? 'Saving…' : 'Save Changes'}
        nextDisabled={saving}
      />
    </div>
  );
}
