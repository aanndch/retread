import { useState } from 'preact/hooks';
import type { LocationUnion } from '../../types';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { PinIcon } from '../../components/icons';
import { FieldCard } from '../../components/field-card';
import { formatDistance, formatIsoDateToDMY } from '../../lib';

// Compact collapsible field: a tappable label + summary row that expands the
// real control inline. Keeps the leg form on one screen by hiding optional
// details until the user needs them.
function DetailRow({ label, value, open, onToggle, children }: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: JSX.Element;
}) {
  return (
    <div class="detail-row">
      <button type="button" class="detail-row-toggle" onClick={onToggle} aria-expanded={open}>
        <span class="detail-row-label">{label}</span>
        <span class="detail-row-value">{value}</span>
        <span class="detail-row-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && <div class="detail-row-body">{children}</div>}
    </div>
  );
}

// A single, tappable place control: shows the stop once on one line (name or a
// hint), opens the place picker on tap, and keeps "My location" one tap away.
function PlaceRow({ emptyLabel, location, gpsLoading, onOpen, onUseLocation, onClear }: {
  emptyLabel: string;
  location: LocationUnion | null;
  gpsLoading: boolean;
  onOpen: () => void;
  onUseLocation: () => void;
  onClear: () => void;
}) {
  const isGps = location?.kind === 'gps';
  const name = location?.name?.trim();
  return (
    <div class="place-row">
      <button type="button" class="place-row-main" onClick={onOpen} disabled={gpsLoading}>
        <span class="place-row-pin" aria-hidden="true">📍</span>
        <span class="place-row-text">
          {gpsLoading ? (
            <span class="place-row-empty">Detecting location…</span>
          ) : name ? (
            <span class="place-row-name">{name}</span>
          ) : (
            <span class="place-row-empty">{emptyLabel}</span>
          )}
          {location && !isGps && !gpsLoading && (
            <span class="place-row-meta">· no pin</span>
          )}
        </span>
      </button>
      {location && !gpsLoading && (
        <button type="button" class="place-row-clear" onClick={onClear} aria-label="Clear location">
          ×
        </button>
      )}
      <Button variant="secondary" size="sm" class="place-row-btn" aria-label="Use my location" onClick={onUseLocation} disabled={gpsLoading}>
        <PinIcon size={14} /> {gpsLoading ? 'Detecting…' : 'My location'}
      </Button>
    </div>
  );
}

interface MetricsStepProps {
  mode: 'new-ride' | 'edit-ride' | 'new-leg' | 'edit';
  rideTitle: string;
  setRideTitle: (t: string) => void;
  // Preview of the auto-derived new-ride title (start label + date, else "Ride · date").
  autoRideTitle: string;
  date: string;
  setDate: (d: string) => void;
  time: string;
  setTime: (t: string) => void;
  km: number | null;
  onKmChange: (k: number | null) => void;
  kmSource: 'auto' | 'manual' | null;
  distanceFromLabel: string | null;
  location: LocationUnion | null;
  gpsLoading: boolean;
  handleDropPin: () => void;
  handleClearLocation: () => void;
  // Set when the user tried to advance without a pin; surfaces the "no map pin"
  // note so the implicit bypass is a conscious choice.
  mapNote: boolean;
  legTitle: string;
  setLegTitle: (t: string) => void;
  // Preview of the auto-derived title (destination label or "Auto").
  autoTitle: string;
  distanceMode: 'auto' | 'manual';
  setDistanceMode: (m: 'auto' | 'manual') => void;
  startLocation: LocationUnion | null;
  startGpsLoading: boolean;
  onClearStartLocation: () => void;
  onRetryStartGps: () => void;
  titleError: string;
  setTitleError: (e: string) => void;
  handleCancel: () => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
  onOpenMapPicker: (target: 'start' | 'location') => void;
  fallbackCenter: [number, number] | null;
  onAutoFillDistance: () => void;
  saving: boolean;
}

export function MetricsStep({
  mode,
  rideTitle,
  setRideTitle,
  autoRideTitle,
  date,
  setDate,
  time,
  setTime,
  km,
  onKmChange,
  kmSource,
  distanceFromLabel,
  location,
  gpsLoading,
  handleDropPin,
  handleClearLocation,
  mapNote,
  legTitle,
  setLegTitle,
  autoTitle,
  distanceMode,
  setDistanceMode,
  startLocation,
  startGpsLoading,
  onClearStartLocation,
  onRetryStartGps,
  titleError,
  setTitleError,
  handleCancel,
  handleStepJump,
  onOpenMapPicker,
  fallbackCenter,
  onAutoFillDistance,
  saving
}: MetricsStepProps) {
  const [openRow, setOpenRow] = useState<'title' | 'date' | 'distance' | null>(null);

  // Compact summaries for the collapsed detail rows.
  const dateSummary = `${date || '—'}${time ? ` · ${time}` : ''}`;
  const rideDateLabel = formatIsoDateToDMY(date);
  const distanceSummary = distanceMode === 'manual'
    ? (km !== null && km !== undefined ? formatDistance(km) : 'Type distance')
    : (km !== null && km !== undefined
        ? `≈ ${formatDistance(km)}`
        : gpsLoading ? 'Measuring…' : 'Auto from route');

  return (
    <div class="wizard-step-content">
      {/* Ride creation/editing — a focused, centered prompt */}
      {(mode === 'new-ride' || mode === 'edit-ride') && (
        <div class="ride-create-body">
          {mode === 'new-ride' && (
            <p class="field-tip ride-create-kicker">Where does this ride begin?</p>
          )}

          {/* Ride Title — Edit Ride: visible required field; New Ride: collapsed
              auto-derived row */}
          {mode === 'edit-ride' && (
            <FieldCard label="Ride Title">
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
            </FieldCard>
          )}

          {mode === 'new-ride' && (
            <DetailRow
              label="Title"
              value={rideTitle || autoRideTitle}
              open={openRow === 'title'}
              onToggle={() => setOpenRow(openRow === 'title' ? null : 'title')}
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
          )}

          {mode === 'new-ride' && (
            <DetailRow
              label="Start date"
              value={rideDateLabel}
              open={openRow === 'date'}
              onToggle={() => setOpenRow(openRow === 'date' ? null : 'date')}
            >
              <div class="form-group">
                <input
                  type="date"
                  class="form-input"
                  value={date}
                  onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => setDate((e.target as HTMLInputElement).value)}
                />
              </div>
            </DetailRow>
          )}

          {/* Starting From - Departure Pin (New Ride / Edit Ride) */}
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
      )}

      {/* Leg metrics (Only for Leg creation or Leg edit modes) */}
      {(mode === 'new-leg' || mode === 'edit') && (
        <>
          {/* Destination — always open (the core of a leg) */}
          <FieldCard label="Destination">
            <span class="field-tip">Choose the stop — name it inside the picker.</span>

            <PlaceRow
              emptyLabel="Choose destination →"
              location={location}
              gpsLoading={gpsLoading}
              onOpen={() => onOpenMapPicker('location')}
              onUseLocation={handleDropPin}
              onClear={handleClearLocation}
            />

            {mapNote && location?.kind !== 'gps' && (
              <span class="field-tip">No map pin — this leg won't appear on the route map.</span>
            )}
          </FieldCard>

          {/* Title — collapsible (auto-derived default shown) */}
          <DetailRow
            label="Title"
            value={legTitle || autoTitle}
            open={openRow === 'title'}
            onToggle={() => setOpenRow(openRow === 'title' ? null : 'title')}
          >
            <div class="form-group">
              <input
                type="text"
                class={`form-input ${titleError ? 'input-error' : ''}`}
                placeholder="e.g. Manali to Jispa"
                value={legTitle}
                onInput={(e: JSX.TargetedEvent<HTMLInputElement>) => {
                  setLegTitle((e.target as HTMLInputElement).value);
                  if ((e.target as HTMLInputElement).value.trim()) setTitleError('');
                }}
              />
              {titleError && <span class="error-text">{titleError}</span>}
            </div>
          </DetailRow>

          {/* Date & Time — collapsible */}
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

          {/* Distance — collapsible */}
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
        </>
      )}

      {/* Step 1 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        {mode === 'new-ride' || mode === 'edit-ride' ? (
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : mode === 'new-ride' ? 'Create Ride' : 'Save Changes'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => handleStepJump(2)} disabled={saving}>
            Next: Photos →
          </Button>
        )}
      </div>
    </div>
  );
}
