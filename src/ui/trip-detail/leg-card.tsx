import { useState, useEffect } from 'preact/hooks';
import type { Page, Trip } from '../../types';

function PhotoThumb({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!url) return null;
  return <img src={url} alt="preview" class="card-photo-thumbnail" />;
}

interface LegCardProps {
  page: Page;
  index: number;
  pages: Page[];
  trip: Trip | null;
  label: string;
}

export function LegCard({ page, index, pages, trip, label }: LegCardProps) {
  let weekday = "";
  if (page.date) {
    const dateParts = page.date.split("-");
    if (dateParts.length === 3) {
      const d = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
      );
      weekday = d.toLocaleDateString(undefined, {
        weekday: "short",
      });
    }
  }

  return (
    <a href={`#/page/${page.id}`} class="timeline-card-item">
      <div class="timeline-card-side">
        <span class="day-num">{label}</span>
        <span class="day-weekday">{weekday}</span>
      </div>

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
            <span class="card-date-badge">{page.date}</span>
            {page.location && (
              <span
                class="card-location-badge"
                style={{
                  textOverflow: "ellipsis",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                📍{" "}
                {page.location.name ||
                  (page.location.kind === "gps"
                    ? `[${page.location.lat.toFixed(4)}, ${page.location.lng.toFixed(4)}]`
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
              if (page.km !== null && page.km !== undefined) {
                return (
                  <span class="card-stat">{page.km} km</span>
                );
              }
              if (page.odo !== null && page.odo !== undefined) {
                let prevOdo: number | null = null;
                if (index > 0) {
                  prevOdo = pages[index - 1].odo ?? null;
                } else if (trip?.startOdo !== null && trip?.startOdo !== undefined) {
                  prevOdo = trip.startOdo;
                }
                if (prevOdo !== null) {
                  const delta = page.odo - prevOdo;
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

        {page.title ? (
          <h5 class="card-day-title">{page.title}</h5>
        ) : null}

        {page.note && (
          <p class="card-note-excerpt">
            {page.note.length > 95
              ? `${page.note.slice(0, 95)}...`
              : page.note}
          </p>
        )}

        {/* Photo previews row */}
        {page.photos && page.photos.length > 0 && (
          <div class="card-photos-strip">
            {page.photos.slice(0, 4).map((blob, idx) => (
              <PhotoThumb key={idx} blob={blob} />
            ))}
            {page.photos.length > 4 && (
              <span class="more-photos-indicator">
                +{page.photos.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
