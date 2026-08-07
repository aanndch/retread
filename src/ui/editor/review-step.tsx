import type { JSX } from 'preact';
import { FieldCard } from '../../components/field-card';
import { StepActions, PlaceRow, TextInput } from './fields';
import { formatDistance } from '../../lib';
import type { LocationUnion } from '../../types';

/**
 * One editable leg row in the Review step — a detected stop from the photo dump
 * (or a single manual leg when no photos were added). `photoIndices` index into
 * the editor's parallel photo arrays (photos / photoThumbs / photoPreviews), so
 * thumbnails and the saved photo list stay in sync with the user's edits
 * (arrange/reorder/remove).
 */
export interface ReviewLeg {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  location: LocationUnion | null; // GPS pin, or null → phantom stop
  photoIndices: number[];
  km?: number | null;
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
  // Ride-level fields (subsumed Start step): title + start pin.
  rideTitle: string;
  setRideTitle: (t: string) => void;
  autoRideTitle: string;
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  onOpenMapPicker: (target: 'start' | 'location') => void;
  mapNote: boolean;
  titleError: string;
  setTitleError: (e: string) => void;
  // Per-leg destination / distance helpers.
  onOpenLegMapPicker: (id: string) => void;
  onClearLegLocation: (id: string) => void;
  onRetryLegGps: (id: string) => void;
  onAutoFillLegDistance: (id: string) => void;
  legGpsLoadingId: string | null;
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
  onOpenLegMapPicker,
  onClearLegLocation,
  onRetryLegGps,
  onAutoFillLegDistance,
  legGpsLoadingId,
}: ReviewStepProps) {
  const days = groupByDate(legs);
  const hasPhotos = legs.some((l) => l.photoIndices.length > 0);

  return (
    <div class="wizard-step-content">
      {building ? (
        <FieldCard label="Building your trip">
          <p class="field-tip" style={{ margin: 0 }}>
            Reading photo dates &amp; places… (a lot of photos can take a moment)
          </p>
        </FieldCard>
      ) : (
        <>
          {/* Ride-level fields (subsumed Start step). */}
          <FieldCard label="Ride title">
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

          {legs.length === 0 ? (
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
                    const legLoading = legGpsLoadingId === leg.id;
                    const distanceSummary =
                      leg.km !== null && leg.km !== undefined
                        ? `${formatDistance(leg.km)}`
                        : leg.location?.kind === 'gps'
                          ? 'Auto from route'
                          : 'No pin';
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
                          <input
                            class="form-input review-leg-date"
                            type="time"
                            value={leg.time || ''}
                            aria-label="Leg time"
                            onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                              onEditLeg(leg.id, { time: (e.target as HTMLInputElement).value })
                            }
                          />
                        </div>

                        <div class="review-leg-dest">
                          <PlaceRow
                            emptyLabel="Choose destination →"
                            location={leg.location}
                            gpsLoading={legLoading}
                            onOpen={() => onOpenLegMapPicker(leg.id)}
                            onUseLocation={() => onRetryLegGps(leg.id)}
                            onClear={() => onClearLegLocation(leg.id)}
                          />
                          {leg.location?.kind !== 'gps' && (
                            <span class="field-tip">No pin — this stop will show as an approximate stop on the map.</span>
                          )}
                        </div>

                        <div class="review-leg-distance">
                          <label class="input-label">Distance (km)</label>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="number"
                              class="form-input"
                              style={{ flex: 1, minWidth: '90px' }}
                              placeholder={leg.location?.kind === 'gps' ? 'e.g. 118' : 'Type distance'}
                              value={leg.km === null || leg.km === undefined ? '' : leg.km}
                              aria-label="Leg distance km"
                              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                                onEditLeg(leg.id, {
                                  km: (e.target as HTMLInputElement).value
                                    ? parseFloat((e.target as HTMLInputElement).value)
                                    : null,
                                })
                              }
                            />
                            <button
                              type="button"
                              class="btn-calc-link"
                              disabled={legLoading || leg.location?.kind !== 'gps'}
                              onClick={() => onAutoFillLegDistance(leg.id)}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style={{ display: 'inline-block', marginRight: '4px' }}>
                                <circle cx="5" cy="19" r="2.5" />
                                <path d="M7 17c6-8-2-10 11-11" />
                                <path d="M14 2l8 8M22 2l-8 8" />
                              </svg>
                              <span>{legLoading ? 'Measuring…' : 'Measure'}</span>
                            </button>
                          </div>
                          {leg.km !== null && leg.km !== undefined && leg.location?.kind === 'gps' && (
                            <span class="field-tip">≈ {distanceSummary} to this stop.</span>
                          )}
                        </div>

                        {leg.photoIndices.length > 0 && (
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
                        )}

                        {hasPhotos && (
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </FieldCard>
            ))
          )}
        </>
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
