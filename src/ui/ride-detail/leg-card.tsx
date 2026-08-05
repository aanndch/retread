import type { Leg } from '../../types';
import { formatDistance, stopLabel } from '../../lib';

interface LegCardProps {
  leg: Leg;
  index: number;
  label: string;
  id?: string;
}

export function LegCard({ leg, index, label, id }: LegCardProps) {
  return (
    <a id={id} href={`#/leg/${leg.id}`} class="timeline-card-item">
      <div class="timeline-card-body">
        <div class="card-title-row">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--spacing-sm)",
              minWidth: 0,
            }}
          >
            {label && (
              <span class="card-date-badge">{label}</span>
            )}
            {leg.location && (
              <span
                class="card-location-badge"
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                📍{" "}
                {stopLabel(leg.location, index + 1)}
              </span>
            )}
          </div>
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              gap: "var(--spacing-xs)",
            }}
          >
            {leg.km !== null && leg.km !== undefined && (
              <span class="card-stat">{formatDistance(leg.km)}</span>
            )}
          </div>
        </div>

        {leg.title ? (
          <h5 class="card-day-title">{leg.title}</h5>
        ) : null}

        {leg.note && (
          <p class="card-note-excerpt">
            {leg.note.length > 95
              ? `${leg.note.slice(0, 95)}...`
              : leg.note}
          </p>
        )}
      </div>
    </a>
  );
}
