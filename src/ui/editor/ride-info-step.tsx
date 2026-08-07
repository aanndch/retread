import { FieldCard } from '../../components/field-card';
import { StepActions, PlaceRow, TextInput } from './fields';
import type { LocationUnion } from '../../types';

interface RideInfoStepProps {
  rideTitle: string;
  setRideTitle: (t: string) => void;
  // Preview of the auto-derived ride title (first stop's name, else date-based).
  autoRideTitle: string;
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  onOpenMapPicker: (target: 'start' | 'location') => void;
  mapNote: boolean;
  titleError: string;
  setTitleError: (e: string) => void;
  // Ride cover: the auto-picked photo shown + editable from the Photos step.
  coverPhotoIndex: number | null;
  photoPreviews: string[];
  step: 1 | 2 | 3 | 4 | 5;
  handleStepJump: (s: 1 | 2 | 3 | 4 | 5) => void;
  saving: boolean;
}

/**
 * Ride Info step (new-ride, step 2): the ride-level fields pulled out of the
 * old crowded Review screen — ride title, start pin, and the ride cover. The
 * legs themselves live in the Legs step (master-detail) that follows.
 */
export function RideInfoStep({
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
  coverPhotoIndex,
  photoPreviews,
  step,
  handleStepJump,
  saving,
}: RideInfoStepProps) {
  return (
    <div class="wizard-step-content">
      <FieldCard label="Ride title">
        <TextInput
          placeholder={autoRideTitle || 'e.g. Spiti Valley Odyssey'}
          value={rideTitle}
          onInput={setRideTitle}
          error={titleError}
          onClearError={() => setTitleError('')}
        />
        <span class="field-tip">Derived from your first stop — edit freely.</span>
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

      <FieldCard label="Ride cover">
        {coverPhotoIndex !== null && photoPreviews[coverPhotoIndex] ? (
          <div class="ride-cover-row">
            <div class="ride-cover-thumb">
              <img src={photoPreviews[coverPhotoIndex]} alt="" class="ride-cover-img" />
              <span class="btn-cover active" aria-hidden="true">★</span>
            </div>
            <button
              type="button"
              class="btn-calc-link"
              onClick={() => handleStepJump(1)}
            >
              Change in Photos →
            </button>
          </div>
        ) : (
          <button type="button" class="btn-calc-link" onClick={() => handleStepJump(1)}>
            Pick a cover photo →
          </button>
        )}
        <span class="field-tip">Tap a ★ on a photo in the Photos step to set the ride cover.</span>
      </FieldCard>

      <StepActions
        onBack={() => handleStepJump((step - 1) as 1 | 2 | 3 | 4 | 5)}
        backDisabled={saving}
        onNext={() => handleStepJump((step + 1) as 1 | 2 | 3 | 4 | 5)}
        nextLabel="Next: Legs →"
        nextDisabled={saving}
      />
    </div>
  );
}
