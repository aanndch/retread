import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { FieldCard } from '../../components/field-card';
import { DetailRow, PlaceRow, TextInput, StepActions } from './fields';
import { formatDistance } from '../../lib';
import type { LocationUnion } from '../../types';

interface LegStepProps {
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  km: number | null;
  onKmChange: (k: number | null) => void;
  kmSource: 'auto' | 'manual' | null;
  distanceFromLabel: string | null;
  location: LocationUnion | null;
  viaPoints?: { lat: number; lng: number; name?: string }[];
  onRemoveViaPoint?: (index: number) => void;
  gpsLoading: boolean;
  handleDropPin: () => void;
  handleClearLocation: () => void;
  mapNote: boolean;
  legTitle: string;
  setLegTitle: (t: string) => void;
  // Preview of the auto-derived leg title (destination label or "Auto").
  autoTitle: string;
  distanceMode: 'auto' | 'manual';
  setDistanceMode: (m: 'auto' | 'manual') => void;
  titleError: string;
  setTitleError: (e: string) => void;
  step: 1 | 2 | 3 | 4 | 5;
  handleCancel: () => void;
    handleStepJump: (s: 1 | 2 | 3 | 4 | 5) => void;
  onOpenMapPicker: (target: 'start' | 'location' | 'via') => void;
  fallbackCenter: [number, number] | null;
  onAutoFillDistance: () => void;
  saving: boolean;
}

// The leg-details step: destination (always open) plus collapsed title,
// date/time, and distance. Used as "Stop" for a new ride and "Details" for a
// new leg or leg edit.
export function LegStep({
  date,
  setDate,
  time,
  setTime,
  km,
  onKmChange,
  kmSource,
  distanceFromLabel,
  location,
  viaPoints,
  onRemoveViaPoint,
  gpsLoading,
  handleDropPin,
  handleClearLocation,
  mapNote,
  legTitle,
  setLegTitle,
  autoTitle,
  distanceMode,
  setDistanceMode,
  titleError,
  setTitleError,
  step,
  handleCancel,
  handleStepJump,
  onOpenMapPicker,
  fallbackCenter,
  onAutoFillDistance,
  saving,
}: LegStepProps) {
  const [openRow, setOpenRow] = useState<'title' | 'date' | 'distance' | null>(null);

  const dateSummary = `${date || '—'}${time ? ` · ${time}` : ''}`;
  const distanceSummary = distanceMode === 'manual'
    ? (km !== null && km !== undefined ? formatDistance(km) : 'Type distance')
    : (km !== null && km !== undefined
        ? `≈ ${formatDistance(km)}`
        : gpsLoading ? 'Measuring…' : 'Auto from route');

  return (
    <div class="wizard-step-content">
      <FieldCard label="Destination">
        <PlaceRow
          emptyLabel="Choose destination →"
          location={location}
          gpsLoading={gpsLoading}
          onOpen={() => onOpenMapPicker('location')}
          onUseLocation={handleDropPin}
          onClear={handleClearLocation}
        />
        {mapNote && location?.kind !== 'gps' && (
          <span class="field-tip">No pin — this stop will show as an approximate stop on the map.</span>
        )}
      </FieldCard>

      <FieldCard label="Route Guide (Via Points)">
        <p class="field-tip" style={{ margin: '0 0 var(--spacing-sm) 0' }}>
          Add towns or highway junctions you passed through to guide the route path.
        </p>

        {viaPoints && viaPoints.length > 0 && (
          <div class="via-points-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {viaPoints.map((vp, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'var(--color-paper-dim)',
                  border: '1px solid var(--color-ink-muted)',
                  borderRadius: 'var(--border-radius)',
                  fontFamily: 'var(--font-typewriter)',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <span style={{ color: 'var(--color-ink-muted)', fontSize: '10px' }}>#{idx + 1}</span>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {vp.name || `${vp.lat.toFixed(4)}, ${vp.lng.toFixed(4)}`}
                  </span>
                </div>
                <button
                  type="button"
                  class="btn-clear"
                  onClick={() => onRemoveViaPoint?.(idx)}
                  aria-label="Remove via point"
                  style={{
                    fontSize: '14px',
                    color: 'var(--color-ink-muted)',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    padding: '2px 6px',
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onOpenMapPicker('via')}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          + Add Waypoint on Map
        </Button>
      </FieldCard>

      <DetailRow
        label="Title"
        value={legTitle || autoTitle}
        open={openRow === 'title'}
        onToggle={() => setOpenRow(openRow === 'title' ? null : 'title')}
      >
        <div class="form-group">
          <TextInput
            placeholder="e.g. Manali to Jispa"
            value={legTitle}
            onInput={setLegTitle}
            error={titleError}
            onClearError={() => setTitleError('')}
          />
        </div>
      </DetailRow>

      <DetailRow
        label="Date & Time"
        value={dateSummary}
        open={openRow === 'date'}
        onToggle={() => setOpenRow(openRow === 'date' ? null : 'date')}
      >
        <div class="form-row">
          <div class="form-group flex-1">
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
      </DetailRow>

      <DetailRow
        label="Distance"
        value={distanceSummary}
        open={openRow === 'distance'}
        onToggle={() => setOpenRow(openRow === 'distance' ? null : 'distance')}
      >
        <div class="form-group">
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
      </DetailRow>

      <StepActions
        onBack={step > 1 ? () => handleStepJump((step - 1) as 1 | 2 | 3 | 4 | 5) : handleCancel}
        backLabel={step > 1 ? '← Back' : 'Cancel'}
        backDisabled={saving}
        onNext={() => handleStepJump((step + 1) as 1 | 2 | 3 | 4 | 5)}
        nextLabel="Next: Photos →"
        nextDisabled={saving}
      />
    </div>
  );
}
