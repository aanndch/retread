import { useState, useEffect, useCallback } from "preact/hooks";
import { db } from "../db";
import { Button } from "../components/button";
import { ArrowLeft, CloseIcon, EditIcon, TrashIcon } from "../components/icons";
import { SquiggleMap } from "./squiggle";
import { computeTotalDistance, formatDistance } from "../lib";
import type { Trip, Page } from "../types";
import type { JSX } from "preact";

interface TripDetailProps {
  tripId: number;
  onNavigate: (route: string) => void;
}

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

export function TripDetail({ tripId, onNavigate }: TripDetailProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const stableNavigate = useCallback((route: string) => {
    onNavigate(route);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const tripRecord = await db.trips.get(tripId);
        if (!tripRecord) {
          if (active) stableNavigate("#/");
          return;
        }

        const pagesRecords = await db.pages
          .where("tripId")
          .equals(tripId)
          .toArray();
        const sortedPages = [...pagesRecords].sort((a, b) =>
          a.date.localeCompare(b.date),
        );

        if (active) {
          setTrip(tripRecord);
          setPages(sortedPages);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load ride details:", err);
        if (active) {
          setLoading(false);
          stableNavigate("#/");
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [tripId]);

  const handleDeleteTrip = async () => {
    try {
      await db.transaction("rw", db.trips, db.pages, async () => {
        await db.pages.where("tripId").equals(tripId).delete();
        await db.trips.delete(tripId);
      });
      onNavigate("#/");
    } catch (err) {
      console.error("Failed to delete ride logbook:", err);
      alert("Failed to delete ride.");
    }
  };

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    try {
      await db.trips.update(tripId, { title: trimmed });
      setTrip((prev) => (prev ? { ...prev, title: trimmed } : prev));
      setShowEditModal(false);
    } catch (err) {
      console.error("Failed to update ride title:", err);
      alert("Failed to save title.");
    }
  };

  if (loading) {
    return <p class="loading-text">Loading ride details...</p>;
  }

  if (!trip) return null;

  // Compile cumulative GPS path segments for squiggle map
  const cumulativePath: { lat: number; lng: number }[] = [];

  pages.forEach((p) => {
    if (p.roadPath && p.roadPath.length > 0) {
      cumulativePath.push(...p.roadPath);
    } else if (p.location && p.location.kind === "gps") {
      if (cumulativePath.length === 0 && trip.startLocation?.kind === "gps") {
        cumulativePath.push({
          lat: trip.startLocation.lat,
          lng: trip.startLocation.lng,
        });
      }
      cumulativePath.push({ lat: p.location.lat, lng: p.location.lng });
    }
  });

  // Calculate cumulative stats
  const totalDays = pages.length;
  const totalKm = computeTotalDistance(pages);
  const hasKm = totalKm > 0;

  // Odo range display
  let odoString = "";
  if (pages.length > 0) {
    const odos = pages
      .map((p) => p.odo)
      .filter((o): o is number => o !== null && o !== undefined);
    if (odos.length >= 2) {
      const minOdo = odos[0];
      const maxOdo = odos[odos.length - 1];
      odoString = `${minOdo} → ${maxOdo} km`;
    } else if (odos.length === 1) {
      odoString = `${odos[0]} km`;
    }
  }

  // Format date range
  let dateRange = "No days logged yet.";
  if (pages.length > 0) {
    const formatDate = (isoStr: string) => {
      const parts = isoStr.split("-");
      if (parts.length === 3) {
        const d = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        );
        return d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "2-digit",
        });
      }
      return isoStr;
    };

    if (pages.length === 1) {
      dateRange = formatDate(pages[0].date);
    } else {
      dateRange = `${formatDate(pages[0].date)} – ${formatDate(pages[pages.length - 1].date)}`;
    }
  }

  return (
    <div class="trip-detail-container">
      <header class="detail-header">
        <Button
          variant="icon"
          aria-label="Back"
          onClick={() => onNavigate("#/")}
        >
          <ArrowLeft />
        </Button>
        <div class="header-titles">
          <h3>{trip.title}</h3>
          <span class="trip-dates-sub">{dateRange}</span>
        </div>
      </header>

      <main class="trip-detail-content">
        {/* Cumulative Squiggle route map */}
        {cumulativePath.length >= 2 ? (
          <SquiggleMap path={cumulativePath} />
        ) : (
          <div class="squiggle-map-empty">
            <span class="empty-icon">🗺</span>
            <p>Log 2+ days with GPS pins to draw your ride route map.</p>
          </div>
        )}

        {/* Ride statistics card */}
        <section class="trip-stats-card">
          <div class="stat-item">
            <span class="stat-label">Total Days</span>
            <span class="stat-value">{totalDays}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Distance</span>
            <span class="stat-value">
              {hasKm ? formatDistance(totalKm) : "—"}
            </span>
          </div>
          {odoString && (
            <div class="stat-item">
              <span class="stat-label">Odometer Range</span>
              <span class="stat-value">{odoString}</span>
            </div>
          )}
        </section>

        {/* Timeline Page logs */}
        <section class="trip-timeline">
          <h4>Daily Logs</h4>
          {pages.length === 0 ? (
            <div class="timeline-empty">
              <p>Write your first day log entry to fill this page.</p>
              <Button
                variant="primary"
                onClick={() =>
                  onNavigate(`#/edit?mode=new-day&tripId=${tripId}`)
                }
              >
                ＋ Add Day 1 Log
              </Button>
            </div>
          ) : (
            <div class="timeline-list">
              {pages.map((page, index) => {
                const dateParts = page.date.split("-");
                let weekday = "";
                let label = `Day ${index + 1}`;

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

                return (
                  <a
                    key={page.id}
                    href={`#/page/${page.id}`}
                    class="timeline-card-item"
                  >
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
                                  ? "GPS"
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
                            if (
                              page.odo !== null &&
                              page.odo !== undefined &&
                              index > 0
                            ) {
                              const prevPage = pages[index - 1];
                              if (
                                prevPage.odo !== null &&
                                prevPage.odo !== undefined
                              ) {
                                const delta = page.odo - prevPage.odo;
                                if (delta > 0)
                                  return (
                                    <span class="card-stat">{delta} km</span>
                                  );
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
              })}
            </div>
          )}
        </section>

        {/* Bottom action row */}
        <section class="page-action-row">
          <div></div>
          <div class="page-edit-group">
            <Button
              variant="tertiary"
              class="btn-icon-text"
              onClick={() => {
                setEditTitle(trip.title);
                setShowEditModal(true);
              }}
            >
              <EditIcon size={14} />
            </Button>
            <Button
              variant="tertiary"
              class="btn-danger-text btn-icon-text"
              onClick={() => setShowDeleteModal(true)}
            >
              <TrashIcon size={14} />
            </Button>
          </div>
        </section>
      </main>

      {/* Floating Action Button to add new day log */}
      {pages.length > 0 && (
        <div class="fab-container">
          <Button
            variant="fab"
            aria-label="Add Day"
            onClick={() => onNavigate(`#/edit?mode=new-day&tripId=${tripId}`)}
          >
            ＋
          </Button>
        </div>
      )}

      {/* Edit Title Modal */}
      {showEditModal && (
        <div class="modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Edit Ride Title</h3>
              <Button
                variant="icon"
                aria-label="Close"
                onClick={() => setShowEditModal(false)}
              >
                <CloseIcon />
              </Button>
            </div>

            <div
              class="settings-body"
              style={{ padding: "var(--spacing-md) 0" }}
            >
              <div class="form-group">
                <label class="input-label">Ride Title</label>
                <input
                  type="text"
                  class="form-input"
                  value={editTitle}
                  onInput={(e: JSX.TargetedEvent<HTMLInputElement>) =>
                    setEditTitle((e.target as HTMLInputElement).value)
                  }
                  autoFocus
                />
              </div>

              <div class="page-action-row page-action-modal">
                <Button
                  variant="secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveTitle}
                  disabled={!editTitle.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div class="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3 style={{ color: "#d9534f" }}>Delete Ride Logbook?</h3>
              <Button
                variant="icon"
                aria-label="Close"
                onClick={() => setShowDeleteModal(false)}
              >
                <CloseIcon />
              </Button>
            </div>

            <div
              class="settings-body"
              style={{ padding: "var(--spacing-md) 0" }}
            >
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--color-ink-muted)",
                  lineHeight: "1.5",
                }}
              >
                This will permanently delete <strong>{trip.title}</strong> and
                all of its daily pages. This action cannot be undone.
              </p>

              <div class="page-action-row page-action-modal">
                <Button
                  variant="secondary"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  class="btn-danger-text"
                  onClick={handleDeleteTrip}
                >
                  Confirm Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
