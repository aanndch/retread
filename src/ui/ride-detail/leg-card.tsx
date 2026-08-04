import type { Leg, Ride } from '../../types';

interface LegCardProps {
  leg: Leg;
  index: number;
  legs: Leg[];
  ride: Ride | null;
  label: string;
}

export function LegCard({ leg, index, legs, ride, label }: LegCardProps) {
  return (
    <a href={`#/leg/${leg.id}`} class="timeline-card-item">
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
                {leg.location.name ||
                  (leg.location.kind === "gps"
                    ? `[${leg.location.lat.toFixed(4)}, ${leg.location.lng.toFixed(4)}]`
                    : "Named")}
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
            {(() => {
              if (leg.km !== null && leg.km !== undefined) {
                return (
                  <span class="card-stat">{leg.km} km</span>
                );
              }
              if (leg.odo !== null && leg.odo !== undefined) {
                let prevOdo: number | null = null;
                if (index > 0) {
                  prevOdo = legs[index - 1].odo ?? null;
                } else if (ride?.startOdo !== null && ride?.startOdo !== undefined) {
                  prevOdo = ride.startOdo;
                }
                if (prevOdo !== null) {
                  const delta = leg.odo - prevOdo;
                  if (delta >= 0) {
                    return (
                      <span class="card-stat">{delta} km</span>
                    );
                  }
                }
              }
              return null;
            })()}
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
