import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { db } from "../db";
import { Button } from "../components/button";
import { Toast, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
import { EditIcon, TrashIcon } from "../components/icons";
import { SquiggleMap } from "./squiggle";
import { PageHeader } from "../components/page-header";
import { MapModal } from "../components/map-modal";
import { LegCard } from "./trip-detail/leg-card";
import { HASH_HOME } from "../constants";
import { computeTotalDistance, formatDistance } from "../lib";
import type { Trip, Page } from "../types";

interface TripDetailProps {
  tripId: number;
  onNavigate: (route: string) => void;
}

export function TripDetail({ tripId, onNavigate }: TripDetailProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  // Fullscreen Map Modal state and handlers
  const [showMapModal, setShowMapModal] = useState(false);

  const openMapModal = () => {
    setShowMapModal(true);
    history.pushState({ modalOpen: "map" }, "");
  };

  const closeMapModal = () => {
    if (showMapModal) {
      setShowMapModal(false);
      if (history.state && history.state.modalOpen === "map") {
        history.back();
      }
    }
  };

  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const stableNavigate = useCallback((route: string) => {
    onNavigateRef.current(route);
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
        const sortedPages = [...pagesRecords].sort((a, b) => {
          const dComp = a.date.localeCompare(b.date);
          if (dComp !== 0) return dComp;
          const tA = a.time || '00:00';
          const tB = b.time || '00:00';
          return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
        });

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
      showToast("Failed to delete ride.");
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
  const totalDays = new Set(pages.map(p => p.date)).size;
  const totalKm = computeTotalDistance(pages, trip?.startOdo);
  const hasKm = totalKm > 0;

  // Odo range display
  let odoString = "";
  const odos = pages
    .map((p) => p.odo)
    .filter((o): o is number => o !== null && o !== undefined);
  if (odos.length > 0) {
    const minOdo = trip?.startOdo ?? odos[0];
    const maxOdo = odos[odos.length - 1];
    if (minOdo !== maxOdo) {
      odoString = `${minOdo} → ${maxOdo} km`;
    } else {
      odoString = `${minOdo} km`;
    }
  } else if (trip?.startOdo != null) {
    odoString = `${trip.startOdo} km`;
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

  // Compile start -> end location summary
  let startLabel = '';
  if (trip.startLocation) {
    startLabel = trip.startLocation.name || 
      (trip.startLocation.kind === 'gps' 
        ? `[${trip.startLocation.lat.toFixed(4)}, ${trip.startLocation.lng.toFixed(4)}]`
        : '');
  }

  let endLabel = '';
  if (pages.length > 0) {
    const lastPage = pages[pages.length - 1];
    if (lastPage.location) {
      endLabel = lastPage.location.name || 
        (lastPage.location.kind === 'gps' 
          ? `[${lastPage.location.lat.toFixed(4)}, ${lastPage.location.lng.toFixed(4)}]`
          : '');
    }
  }

  let routeSummary = '';
  if (startLabel && endLabel) {
    routeSummary = `${startLabel} → ${endLabel}`;
  } else if (startLabel) {
    routeSummary = startLabel;
  }

  return (
    <div class="trip-detail-container">
      <PageHeader
        title={trip.title}
        onBack={() => onNavigate(HASH_HOME)}
        subTitle={
          <>
            {routeSummary && (
              <div style={{ fontSize: '12px', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-mechanical)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {routeSummary}
              </div>
            )}
            <span class="trip-dates-sub">{dateRange}</span>
          </>
        }
        classType="detail"
      />

      <main class="trip-detail-content">
        {/* Cumulative Squiggle route map */}
        {cumulativePath.length >= 2 ? (
          <div class="map-interactive-trigger" onClick={openMapModal}>
            <SquiggleMap path={cumulativePath} width={430} height={160} />
          </div>
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
          <h4>Ride Timeline</h4>
          {pages.length === 0 ? (
            <div class="timeline-empty">
              <p>Write your first leg log entry to start your ride book.</p>
              <Button
                variant="primary"
                onClick={() =>
                  onNavigate(`#/edit?mode=new-day&tripId=${tripId}`)
                }
              >
                ＋ Log First Leg
              </Button>
            </div>
          ) : (
            <div class="timeline-list">
              {(() => {
                const uniqueDates = Array.from(new Set(pages.map((p) => p.date))).sort();

                return pages.map((page, index) => {
                  const dayNum = uniqueDates.indexOf(page.date) + 1;
                  const pagesOnDate = pages.filter((p) => p.date === page.date);
                  let label = `Day ${dayNum}`;
                  if (pagesOnDate.length > 1) {
                    const legIdx = pagesOnDate.indexOf(page) + 1;
                    label = `Day ${dayNum} • Leg ${legIdx}`;
                  }

                  return (
                    <LegCard
                      key={page.id}
                      page={page}
                      index={index}
                      pages={pages}
                      trip={trip}
                      label={label}
                    />
                  );
                });
              })()}
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
              onClick={() => onNavigate(`#/edit?mode=edit-trip&tripId=${tripId}`)}
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
            aria-label="Add Leg"
            onClick={() => onNavigate(`#/edit?mode=new-day&tripId=${tripId}`)}
          >
            ＋
          </Button>
        </div>
      )}



      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete Ride Logbook?"
          message={`This will permanently delete ${trip.title} and all of its daily pages. This action cannot be undone.`}
          confirmLabel="Confirm Delete"
          onConfirm={handleDeleteTrip}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Fullscreen Map Overlay */}
      <MapModal
        isOpen={showMapModal}
        path={cumulativePath}
        onClose={closeMapModal}
      />

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
