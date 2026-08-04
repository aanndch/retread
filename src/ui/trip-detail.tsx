import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { Fragment } from "preact";
import { db } from "../db";
import { Button } from "../components/button";
import { Toast, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
import { ArrowLeft, EditIcon, TrashIcon } from "../components/icons";
import { SquiggleMap } from "./squiggle";
import { MapModal } from "../components/map-modal";
import { LegCard } from "./trip-detail/leg-card";
import { HASH_HOME } from "../constants";
import {
  computeTotalDistance,
  formatDistance,
  formatIsoDateToDMY,
  buildStops,
  computeDayDistances,
} from "../lib";
import type { Trip, Page } from "../types";

function DayPhotoRail({ pages, onNavigate }: { pages: Page[]; onNavigate: (route: string) => void }) {
  const [urls, setUrls] = useState<{ url: string; pageId: number }[]>([]);

  useEffect(() => {
    const collected: { url: string; pageId: number }[] = [];
    const handles: string[] = [];

    for (const page of pages) {
      for (const blob of page.photos || []) {
        const url = URL.createObjectURL(blob);
        handles.push(url);
        collected.push({ url, pageId: page.id! });
      }
    }

    setUrls(collected);
    return () => handles.forEach((h) => URL.revokeObjectURL(h));
  }, [pages]);

  if (urls.length === 0) return null;

  return (
    <div class="photo-rail" role="list" aria-label="Day photos">
      {urls.map(({ url, pageId }, idx) => (
        <button
          key={idx}
          class="photo-thumb"
          role="listitem"
          aria-label={`Open photo ${idx + 1}`}
          onClick={() => onNavigate(`#/page/${pageId}`)}
        >
          <img src={url} alt={`Day photo ${idx + 1}`} />
        </button>
      ))}
    </div>
  );
}


interface TripDetailProps {
  tripId: number;
  onNavigate: (route: string) => void;
  onReady?: () => void;
}

function weekdayFor(date: string): string {
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function RouteTrail({ stops }: { stops: string[] }) {
  const MAX_SHOWN = 5;
  const nodes: { name: string; more?: number; last?: boolean }[] = [];

  if (stops.length <= MAX_SHOWN) {
    nodes.push(...stops.map((name) => ({ name })));
  } else {
    nodes.push(...stops.slice(0, 3).map((name) => ({ name })));
    nodes.push({ name: "", more: stops.length - 4 });
    nodes.push({ name: stops[stops.length - 1], last: true });
  }

  return (
    <div class="ride-trail" role="img" aria-label={`Route: ${stops.join(" to ")}`}>
      {nodes.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && <span class="trail-line" aria-hidden="true" />}
          <span
            class={`trail-stop${i === 0 ? " is-start" : ""}${n.last ? " is-end" : ""}`}
          >
            <span class="trail-dot" aria-hidden="true" />
            {n.more ? (
              <span class="trail-name trail-name-more">+{n.more}</span>
            ) : (
              <span class="trail-name">{n.name}</span>
            )}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function TripDetail({ tripId, onNavigate, onReady }: TripDetailProps) {
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
    setShowMapModal(false);
  };

  // Close modals on browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (showMapModal) setShowMapModal(false);
      if (showDeleteModal) setShowDeleteModal(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showMapModal, showDeleteModal]);

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
          onReady?.();
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

  // Format date range
  let dateRange = "No days logged yet.";
  if (pages.length > 0) {
    if (pages.length === 1) {
      dateRange = formatIsoDateToDMY(pages[0].date);
    } else {
      dateRange = `${formatIsoDateToDMY(pages[0].date)} — ${formatIsoDateToDMY(pages[pages.length - 1].date)}`;
    }
  }

  // Compile deduped trail of distinct stops + per-day distances
  const stops = buildStops(trip.startLocation, pages);
  const dayDistances = computeDayDistances(pages, trip?.startOdo);

  const uniqueDates = Array.from(new Set(pages.map((p) => p.date))).sort();

  return (
    <div class="trip-detail-container">
      {/* Top bar: back + actions */}
      <header class="ride-topbar">
        <Button
          variant="icon"
          aria-label="Back"
          onClick={() => onNavigate(HASH_HOME)}
        >
          <ArrowLeft />
        </Button>
        <div class="ride-topbar-spacer" />
        <Button
          variant="icon"
          aria-label="Edit ride"
          onClick={() => onNavigate(`#/edit?mode=edit-trip&tripId=${tripId}`)}
        >
          <EditIcon size={14} />
        </Button>
        <Button
          variant="icon"
          class="btn-danger-text btn-icon-text"
          aria-label="Delete ride"
          onClick={() => setShowDeleteModal(true)}
        >
          <TrashIcon size={14} />
        </Button>
      </header>

      <main class="trip-detail-content">
        {/* Hero: kicker, title, route-line trail */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">{dateRange}</span>
          <h1 class="ride-hero-title">{trip.title || 'Untitled Ride'}</h1>
          {stops.length > 0 && <RouteTrail stops={stops} />}
        </section>

        {/* Cumulative Squiggle route map */}
        <section class="ride-map-hero">
          {cumulativePath.length >= 2 ? (
            <div class="map-interactive-trigger" onClick={openMapModal}>
              <SquiggleMap path={cumulativePath} width={430} height={200} />
            </div>
          ) : (
            <div class="squiggle-map-empty">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 17 L7 9 L11 14 L17 5 L21 10" stroke-dasharray="2 3" />
                <circle cx="3" cy="17" r="1.6" fill="currentColor" />
                <circle cx="21" cy="10" r="1.6" fill="currentColor" />
              </svg>
              <p>Log 2+ legs with GPS pins to draw your ride route map.</p>
            </div>
          )}
        </section>

        {/* Ride statistics spec plate */}
        <section class="trip-stats-card">
          <div class="stat-item">
            <span class="stat-label">Days</span>
            <span class="stat-value">{totalDays}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Legs</span>
            <span class="stat-value">{pages.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Distance</span>
            <span class="stat-value">
              {hasKm ? formatDistance(totalKm) : "—"}
            </span>
          </div>
        </section>

        {/* Day-grouped Timeline */}
        <section class="trip-timeline">
          {pages.length === 0 ? (
            <div class="timeline-empty">
              <p>Log your first leg to start your ride book.</p>
              <Button
                variant="primary"
                onClick={() =>
                  onNavigate(`#/edit?mode=new-leg&tripId=${tripId}`)
                }
              >
                ＋ Log First Leg
              </Button>
            </div>
          ) : (
            <div class="timeline-list">
              {uniqueDates.map((date) => {
                const dayPages = pages.filter((p) => p.date === date);
                const dayNum = uniqueDates.indexOf(date) + 1;
                const dayKm = dayDistances.get(date) || 0;

                return (
                  <div class="day-group" key={date}>
                    <div class="day-group-header">
                      <div class="day-group-title">
                        <span class="day-group-label">Day {dayNum}</span>
                        <span class="day-group-weekday">{weekdayFor(date)}</span>
                      </div>
                      <div class="day-group-meta">
                        <span class="day-group-date">{formatIsoDateToDMY(date)}</span>
                        {dayKm > 0 && (
                          <>
                            <span class="day-group-sep">·</span>
                            <span class="day-group-km">{formatDistance(dayKm)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div class="day-group-body">
                      {dayPages.map((page) => (
                        <LegCard
                          key={page.id}
                          page={page}
                          index={pages.indexOf(page)}
                          pages={pages}
                          trip={trip}
                          label={dayPages.length > 1 ? `Leg ${dayPages.indexOf(page) + 1}` : ""}
                        />
                      ))}
                      <DayPhotoRail pages={dayPages} onNavigate={onNavigate} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Floating Action Button to add new leg */}
      {pages.length > 0 && (
        <div class="fab-container">
          <Button
            variant="fab"
            aria-label="Add Leg"
            onClick={() => onNavigate(`#/edit?mode=new-leg&tripId=${tripId}`)}
          >
            ＋
          </Button>
        </div>
      )}



      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete Ride Logbook?"
          message={`This will permanently delete ${trip.title} and all of its legs. This action cannot be undone.`}
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
