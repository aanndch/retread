import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { FieldCard } from '../../components/field-card';
import { StepActions, PlaceRow, TextInput } from './fields';
import { formatDistance } from '../../lib';
import type { LocationUnion } from '../../types';

/** One editable leg row — a detected stop from the photo dump (or a single
 * manual leg when no photos were added). `photoIndices` index into the editor's
 * parallel photo arrays, so thumbnails and the saved photo list stay in sync. */
export interface ReviewLeg {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  location: LocationUnion | null; // GPS pin, or null → phantom stop
  photoIndices: number[];
  km?: number | null;
}

interface LegsStepProps {
  legs: ReviewLeg[];
  coverPhotoIndex: number | null;
  photoPreviews: string[];
  building: boolean;
  gpsUnavailable: boolean;
  onEditLeg: (id: string, patch: Partial<ReviewLeg>) => void;
  onMergeLeg: (intoId: string, fromId: string) => void;
  onSplitLeg: (id: string) => void;
  onSetCover: (index: number) => void;
  step: 1 | 2 | 3 | 4 | 5;
  handleStepJump: (s: 1 | 2 | 3 | 4 | 5) => void;
  saving: boolean;
  // Per-leg destination / distance helpers.
  onOpenLegMapPicker: (id: string) => void;
  onClearLegLocation: (id: string) => void;
  onRetryLegGps: (id: string) => void;
  onAutoFillLegDistance: (id: string) => void;
  legGpsLoadingId: string | null;
}

/** Groups legs into day buckets (preserving order) so the overview reads day-grouped. */
function groupByDate(legs: ReviewLeg[]): { date: string; legs: ReviewLeg[] }[] {
  const out: { date: string; legs: ReviewLeg[] }[] = [];
  for (const leg of legs) {
    const last = out[out.length - 1];
    if (last && last.date === leg.date) last.legs.push(leg);
    else out.push({ date: leg.date, legs: [leg] });
  }
  return out;
}

/**
 * Legs step (new-ride, step 3): a master-detail view. The overview is a set of
 * day-grouped COMPACT cards — one per leg, showing only name, date, a pin badge
 * ("pin set" vs "no pin — phantom"), a photo thumbnail + count, and a cover dot.
 * Merge/split live on the overview (structural actions). Tapping a card opens
 * the full per-leg sub-editor (destination pin, title, date/time, distance),
 * reusing the same per-leg helpers; a Back returns to the overview.
 */
export function LegsStep({
  legs,
  coverPhotoIndex,
  photoPreviews,
  building,
  gpsUnavailable,
  onEditLeg,
  onMergeLeg,
  onSplitLeg,
  onSetCover,
  step,
  handleStepJump,
  saving,
  onOpenLegMapPicker,
  onClearLegLocation,
  onRetryLegGps,
  onAutoFillLegDistance,
  legGpsLoadingId,
}: LegsStepProps) {
  // The leg currently open in the sub-editor; null → showing the overview.
  const [editingId, setEditingId] = useState<string | null>(null);

  if (building) {
    return (
      <div class="wizard-step-content">
        <FieldCard label="Building your trip">
          <p class="field-tip" style={{ margin: 0 }}>
            Reading photo dates &amp; places… (a lot of photos can take a moment)
          </p>
        </FieldCard>
      </div>
    );
  }

  if (legs.length === 0) {
    return (
      <div class="wizard-step-content">
        <FieldCard label="Legs">
          <p class="field-tip" style={{ margin: 0 }}>
            Add photos to build legs automatically, or continue to write the ride by hand.
          </p>
        </FieldCard>
        <StepActions
          onBack={() => handleStepJump((step - 1) as 1 | 2 | 3 | 4 | 5)}
          backDisabled={saving}
          onNext={() => handleStepJump((step + 1) as 1 | 2 | 3 | 4 | 5)}
          nextLabel="Next: Story →"
          nextDisabled={saving}
        />
      </div>
    );
  }

  const editing = editingId !== null ? legs.find((l) => l.id === editingId) ?? null : null;
  const editingIdx = editing ? legs.findIndex((l) => l.id === editing.id) : -1;

  // ---- Sub-editor: the full per-leg form for the selected leg ----
  if (editing) {
    const leg = editing;
    const legLoading = legGpsLoadingId === leg.id;
    const distanceSummary =
      leg.km !== null && leg.km !== undefined
        ? `${formatDistance(leg.km)}`
        : leg.location?.kind === 'gps'
          ? 'Auto from route'
          : 'No pin';
    const prevLeg = editingIdx > 0 ? legs[editingIdx - 1] : null;
    const nextLeg = editingIdx < legs.length - 1 ? legs[editingIdx + 1] : null;

    return (
      <div class="wizard-step-content">
        <div class="legs-sub-editor-top">
          <button type="button" class="btn-calc-link" onClick={() => setEditingId(null)}>
            ← Back to overview
          </button>
          <div class="legs-sub-editor-switch">
            <button
              type="button"
              class="btn-arrange"
              disabled={!prevLeg}
              onClick={() => prevLeg && setEditingId(prevLeg.id)}
              aria-label="Previous leg"
            >
              ←
            </button>
            <span class="field-tip">{editingIdx + 1} / {legs.length}</span>
            <button
              type="button"
              class="btn-arrange"
              disabled={!nextLeg}
              onClick={() => nextLeg && setEditingId(nextLeg.id)}
              aria-label="Next leg"
            >
              →
            </button>
          </div>
        </div>

        <FieldCard label="Leg name">
          <TextInput
            placeholder="Stop name"
            value={leg.title}
            onInput={(v) => onEditLeg(leg.id, { title: v })}
          />
        </FieldCard>

        <FieldCard label="Destination">
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
        </FieldCard>

        <FieldCard label="Date & Time">
          <div class="form-row">
            <input
              class="form-input"
              style={{ flex: 1.8 }}
              type="date"
              value={leg.date}
              aria-label="Leg date"
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                onEditLeg(leg.id, { date: (e.target as HTMLInputElement).value })
              }
            />
            <input
              class="form-input"
              style={{ flex: 1.2 }}
              type="time"
              value={leg.time || ''}
              aria-label="Leg time"
              onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                onEditLeg(leg.id, { time: (e.target as HTMLInputElement).value })
              }
            />
          </div>
        </FieldCard>

        <FieldCard label="Distance">
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
        </FieldCard>

        {leg.photoIndices.length > 0 && (
          <FieldCard label="Photos">
            <div class="photo-previews-grid">
              {leg.photoIndices.map((idx) => (
                <div key={idx} class="photo-preview-item">
                  <img src={photoPreviews[idx]} alt="" class="photo-preview-img" />
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
            <button type="button" class="btn-calc-link" onClick={() => setEditingId(null)}>
              Done editing this leg →
            </button>
          </FieldCard>
        )}
      </div>
    );
  }

  // ---- Overview: day-grouped compact leg cards ----
  const hasPhotos = legs.some((l) => l.photoIndices.length > 0);
  const days = groupByDate(legs);

  return (
    <div class="wizard-step-content">
      <p class="field-tip" style={{ margin: '0 0 var(--spacing-sm)' }}>
        Tap a leg to edit its pin, date, or distance. Merge &amp; split to fix stops caught together.
      </p>

      {gpsUnavailable && (
        <div class="gps-notice">
          GPS wasn't readable in these photos — stops are split by date, but pins &amp; places are manual.
          Android may strip location from shared photos.
        </div>
      )}

      {days.map((day) => (
        <FieldCard key={day.date} label={day.date}>
          <div class="legs-overview">
            {day.legs.map((leg, i) => {
              const canSplit = leg.photoIndices.length >= 2;
              const hasPin = leg.location?.kind === 'gps';
              const isLast = i === day.legs.length - 1;
              const firstPhotoIdx = leg.photoIndices[0];
              const holdsCover = leg.photoIndices.includes(coverPhotoIndex ?? -1);
              return (
                <div key={leg.id} class="leg-overview-card">
                  <button
                    type="button"
                    class="leg-overview-main"
                    onClick={() => setEditingId(leg.id)}
                  >
                    <span class={`leg-pin-badge${hasPin ? ' pin-set' : ' pin-none'}`}>
                      {hasPin ? 'pin set' : 'no pin'}
                    </span>
                    <span class="leg-overview-name">{leg.title || 'Stop'}</span>
                    <span class="leg-overview-meta">
                      {leg.time || '—'}
                      {leg.km !== null && leg.km !== undefined ? ` · ${formatDistance(leg.km)}` : ''}
                    </span>
                    {leg.photoIndices.length > 0 ? (
                      <span class="leg-overview-photos">
                        {firstPhotoIdx !== undefined && photoPreviews[firstPhotoIdx] && (
                          <img
                            src={photoPreviews[firstPhotoIdx]}
                            alt=""
                            class="leg-overview-thumb"
                          />
                        )}
                        {leg.photoIndices.length}
                        {holdsCover && <span class="leg-cover-dot" title="Ride cover">★</span>}
                      </span>
                    ) : (
                      <span class="leg-overview-photos leg-overview-nophotos">no photos</span>
                    )}
                  </button>

                  {hasPhotos && (
                    <div class="leg-overview-actions">
                      <button
                        type="button"
                        class="btn-arrange"
                        disabled={isLast}
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
      ))}

      <StepActions
        onBack={() => handleStepJump((step - 1) as 1 | 2 | 3 | 4 | 5)}
        backDisabled={saving}
        onNext={() => handleStepJump((step + 1) as 1 | 2 | 3 | 4 | 5)}
        nextLabel="Next: Story →"
        nextDisabled={saving}
      />
    </div>
  );
}
