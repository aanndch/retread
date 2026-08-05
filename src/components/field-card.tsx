import type { ComponentChildren } from 'preact';

interface FieldCardProps {
  label?: string;
  // Right-aligned slot for a small status (live count, connected chip, etc.).
  action?: ComponentChildren;
  children: ComponentChildren;
}

// The canonical card used across the app: a paper-dim frame with a small
// uppercase mechanical label. Replaces ad-hoc per-screen card styling so every
// form/modal/settings surface shares one consistent look.
export function FieldCard({ label, action, children }: FieldCardProps) {
  return (
    <section class="field-card">
      {(label || action) && (
        <div class="field-card-head">
          {label && <span class="field-card-label">{label}</span>}
          {action}
        </div>
      )}
      <div class="field-card-body">{children}</div>
    </section>
  );
}
