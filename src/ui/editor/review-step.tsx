import type { JSX } from 'preact';
import { FieldCard } from '../../components/field-card';
import { StepActions } from './fields';
import type { LocationUnion } from '../../types';

/**
 * One editable leg row in the Review step — a detected stop from the photo dump.
 * `photoIndices` index into the editor's parallel photo arrays (photos /
 * photoThumbs / photoPreviews), so thumbnails and the saved photo list stay in
 * sync with the user's edits (arrange/reorder/remove).
 */
export interface ReviewLeg {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  location: LocationUnion | null; // GPS pin, or null → phantom stop
  photoIndices: number[];
}

interface ReviewStepProps {
  legs: ReviewLeg[];
  coverPhotoIndex: number | null;
  photoPreviews: string[];
  building: boolean;
  onEditLeg: (id: string, patch: Partial<ReviewLeg>) => void;
  onMergeLeg: (intoId: string, fromId: string) => void;
  onSplitLeg: (id: string) => void;
  onSetCover: (index: number) => void;
  onCreateRide: () => void;
  step: 1 | 2 | 3 | 4 | 5;
  handleStepJump: (s: 1 | 2 | 3 | 4 | 5) => void;
  saving: boolean;
}

/** Groups legs into day buckets (preserving order) so the UI reads day-grouped. */
function groupByDate(legs: ReviewLeg[]): { date: string; legs: ReviewLeg[] }[] {
  const out: { date: string; legs: ReviewLeg[] }[] = [];
  for (const leg of legs) {
    const last = out[out.length - 1];
    if (last && last.date === leg.date) last.legs.push(leg);
    else out.push({ date: leg.date, legs: [leg] });
  }
  return out;
}

export function ReviewStep({
  legs,
  coverPhotoIndex,
  photoPreviews,
  building,
  onEditLeg,
  onMergeLeg,
  onSplitLeg,
  onSetCover,
  onCreateRide,
  step,
  handleStepJump,
  saving,
}: ReviewStepProps) {
  const days = groupByDate(legs);

  return (
    <div class="wizard-step-content">
      {building ? (
        <FieldCard label="Building your trip">
          <p class="field-tip" style={{ margin: 0 }}>
            Reading photo dates &amp; places… (a lot of photos can take a moment)
          </p>
        </FieldCard>
      ) : legs.length === 0 ? (
        <FieldCard label="Review legs">
          <p class="field-tip" style={{ margin: 0 }}>
            Add photos to build legs automatically, or continue to write the ride by hand.
          </p>
        </FieldCard>
      ) : (
        days.map((day) => (
          <FieldCard key={day.date} label={day.date}>
            <div class="review-legs">
              {day.legs.map((leg, i) => {
                const canSplit = leg.photoIndices.length >= 2;
                return (
                  <div key={leg.id} class="review-leg">
                    <div class="review-leg-name-row">
                      <input
                        class="form-input review-leg-name"
                        type="text"
                        value={leg.title}
                        aria-label="Leg name"
                        placeholder="Stop name"
                        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                          onEditLeg(leg.id, { title: (e.target as HTMLInputElement).value })
                        }
                      />
                      <input
                        class="form-input review-leg-date"
                        type="date"
                        value={leg.date}
                        aria-label="Leg date"
                        onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                          onEditLeg(leg.id, { date: (e.target as HTMLInputElement).value })
                        }
                      />
                    </div>

                    <p class="review-leg-pin">
                      {leg.location?.kind === 'gps' ? (
                        <>
                          📍 pin set · {leg.location.lat.toFixed(5)}, {leg.location.lng.toFixed(5)}
                        </>
                      ) : (
                        <>no pin — will be a phantom stop</>
                      )}
                    </p>

                    <div class="photo-previews-grid">
                      {leg.photoIndices.map((idx) => (
                        <div key={idx} class="photo-preview-item">
                          <img
                            src={photoPreviews[idx]}
                            alt=""
                            class="photo-preview-img"
                            onClick={() => onSetCover(idx)}
                          />
                          <button
                            type="button"
                            class={`btn-cover${coverPhotoIndex === idx ? ' active' : ''}`}
                            aria-label={coverPhotoIndex === idx ? 'Remove as ride cover' : 'Set as ride cover'}
                            title={coverPhotoIndex === idx ? 'Ride cover' : 'Set as ride cover'}
                            onClick={() => onSetCover(idx)}
                          >
                            {coverPhotoIndex === idx ? '★' : '☆'}
                          </button>
                        </div>
                      ))}
                    </div>

                    <div class="review-leg-actions">
                      <button
                        type="button"
                        class="btn-arrange"
                        disabled={i === day.legs.length - 1}
                        onClick={() => onMergeLeg(leg.id, day.legs[i + 1].id)}
                      >
                        Merge with next ↓
                      </button>
                      <button type="button" class="btn-arrange" disabled={!canSplit} onClick={() => onSplitLeg(leg.id)}>
                        Split
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </FieldCard>
        ))
      )}

      <StepActions
        onBack={() => handleStepJump((step - 1) as 1 | 2 | 3 | 4 | 5)}
        backDisabled={building || saving}
        onNext={() => handleStepJump((step + 1) as 1 | 2 | 3 | 4 | 5)}
        nextLabel="Next: Story →"
        nextDisabled={building || saving}
      />

      {legs.length > 0 && (
        <div class="form-actions review-create-row">
          <button type="button" class="btn-primary" disabled={building || saving} onClick={onCreateRide}>
            Create ride from these {legs.length} legs
          </button>
        </div>
      )}
    </div>
  );
}
