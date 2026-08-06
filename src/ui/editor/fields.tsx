import type { ComponentChildren } from 'preact';
import type { JSX } from 'preact';
import { Button } from '../../components/button';
import { PinIcon } from '../../components/icons';
import type { LocationUnion } from '../../types';

// Compact collapsible field: a tappable label + summary row that expands the
// real control inline. Keeps the wizard steps on one screen by hiding optional
// details until the user needs them.
export function DetailRow({ label, value, open, onToggle, children }: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  children: JSX.Element | ComponentChildren;
}) {
  return (
    <div class="detail-row">
      <button type="button" class="detail-row-toggle" onClick={onToggle} aria-expanded={open}>
        <span class="detail-row-label">{label}</span>
        <span class="detail-row-value">{value}</span>
        <span class="detail-row-chevron" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <div class={`detail-row-expand${open ? ' open' : ''}`}>
        <div class="detail-row-expand-inner">
          <div class="detail-row-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

// The canonical free-text input with inline error state, shared by every step's
// title field. Typing clears the error once the value is non-empty.
export function TextInput({ value, onInput, placeholder, error, onClearError }: {
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  error?: string;
  onClearError?: () => void;
}) {
  return (
    <>
      <input
        type="text"
        class={`form-input ${error ? 'input-error' : ''}`}
        placeholder={placeholder}
        value={value}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          onInput(v);
          if (v.trim() && onClearError) onClearError();
        }}
      />
      {error && <span class="error-text">{error}</span>}
    </>
  );
}

// The wizard nav bar: secondary action (back/cancel) on the left, primary
// action (next/submit) on the right. `submit` renders the primary as a submit
// button so it drives the enclosing form.
export function StepActions({ onBack, backLabel = '← Back', backDisabled, onNext, nextLabel = 'Next →', nextDisabled, submit }: {
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  submit?: boolean;
}) {
  return (
    <div class="form-actions">
      <Button variant="secondary" onClick={onBack} disabled={backDisabled}>
        {backLabel}
      </Button>
      <Button type={submit ? 'submit' : 'button'} variant="primary" onClick={submit ? undefined : onNext} disabled={nextDisabled}>
        {nextLabel}
      </Button>
    </div>
  );
}

// A single, tappable place control: shows the stop once on one line (name or a
// hint), opens the place picker on tap, and keeps "My location" one tap away.
export function PlaceRow({ emptyLabel, location, gpsLoading, onOpen, onUseLocation, onClear }: {
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
