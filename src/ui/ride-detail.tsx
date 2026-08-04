import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import { useLiveQuery } from "dexie-react-hooks";
import { Fragment } from "preact";
import { db } from "../db";
import { Button } from "../components/button";
import { Toast, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
import { ArrowLeft, EditIcon, TrashIcon } from "../components/icons";
import { SquiggleMap, DAY_COLORS } from "./squiggle";
import type { SquiggleSegment, SquiggleStop } from "./squiggle";
import { MapModal } from "../components/map-modal";
import { LegCard } from "./ride-detail/leg-card";
import { HASH_HOME } from "../constants";
import {
  computeTotalDistance,
  formatDistance,
  formatIsoDateToDMY,
  buildStops,
  computeDayDistances,
} from "../lib";
import type { Ride, Leg } from "../types";

function DayPhotoRail({ legs, onNavigate }: { legs: Leg[]; onNavigate: (route: string) => void }) {
  const [urls, setUrls] = useState<{ url: string; legId: number }[]>([]);

  useEffect(() => {
    const collected: { url: string; legId: number }[] = [];
    const handles: string[] = [];

    for (const leg of legs) {
      for (const blob of leg.photos || []) {
        const url = URL.createObjectURL(blob);
        handles.push(url);
        collected.push({ url, legId: leg.id! });
      }
    }

    setUrls(collected);
    return () => handles.forEach((h) => URL.revokeObjectURL(h));
  }, [legs]);

  if (urls.length === 0) return null;

  return (
    <div class="photo-rail" role="list" aria-label="Day photos">
      {urls.map(({ url, legId }, idx) => (
        <button
          key={idx}
          class="photo-thumb"
          role="listitem"
          aria-label={`Open photo ${idx + 1}`}
          onClick={() => onNavigate(`#/leg/${legId}`)}
        >
          <img src={url} alt={`Day photo ${idx + 1}`} />
        </button>
      ))}
    </div>
  );
}


interface RideDetailProps {
  rideId: number;
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

export function RideDetail({ rideId, onNavigate, onReady }: RideDetailProps) {
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

  // Reactive ride + legs: re-fires whenever routes are backfilled (e.g. OSRM
  // snapping finishing after the page mounted), so the map fills in live.
  const liveData = useLiveQuery(
    async () => {
      const rideRecord = await db.rides.get(rideId);
      const legsRecords = await db.legs
        .where("rideId")
        .equals(rideId)
        .toArray();
      const sortedLegs = [...legsRecords].sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        const tA = a.time || '00:00';
        const tB = b.time || '00:00';
        return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
      });
      return { ride: rideRecord, legs: sortedLegs };
    },
    [rideId]
  );

  const ride: Ride | null = liveData?.ride ?? null;
  const legs: Leg[] = liveData?.legs ?? [];
  const loading = liveData === undefined;

  // Fade the page in once the ride data has actually rendered.
  useEffect(() => {
    if (liveData?.ride) onReady?.();
  }, [liveData, onReady]);

  // If the ride no longer exists, bounce back home (guarded to run once).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (liveData !== undefined && !liveData.ride && !redirectedRef.current) {
      redirectedRef.current = true;
      stableNavigate("#/");
    }
  }, [liveData, stableNavigate]);

  const handleDeleteRide = async () => {
    try {
      await db.transaction("rw", db.rides, db.legs, async () => {
        await db.legs.where("rideId").equals(rideId).delete();
        await db.rides.delete(rideId);
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

  if (!ride) return null;

  // Compile cumulative GPS path segments for squiggle map
  const cumulativePath: { lat: number; lng: number }[] = [];

  legs.forEach((l) => {
    if (l.roadPath && l.roadPath.length > 0) {
      cumulativePath.push(...l.roadPath);
    } else if (l.location && l.location.kind === "gps") {
      if (cumulativePath.length === 0 && ride.startLocation?.kind === "gps") {
        cumulativePath.push({
          lat: ride.startLocation.lat,
          lng: ride.startLocation.lng,
        });
      }
      cumulativePath.push({ lat: l.location.lat, lng: l.location.lng });
    }
  });

  // Calculate cumulative stats
  const totalDays = new Set(legs.map(l => l.date)).size;
  const totalKm = computeTotalDistance(legs, ride?.startOdo);
  const hasKm = totalKm > 0;

  // Format date range
  let dateRange = "No days logged yet.";
  if (legs.length > 0) {
    if (legs.length === 1) {
      dateRange = formatIsoDateToDMY(legs[0].date);
    } else {
      dateRange = `${formatIsoDateToDMY(legs[0].date)} — ${formatIsoDateToDMY(legs[legs.length - 1].date)}`;
    }
  }

  // Compile deduped trail of distinct stops + per-day distances
  const stops = buildStops(ride.startLocation, legs);
  const dayDistances = computeDayDistances(legs, ride?.startOdo);

  const uniqueDates = Array.from(new Set(legs.map((l) => l.date))).sort();

  // Day-colored map segments: one per leg that has a snapped road path.
  const segments: SquiggleSegment[] = legs
    .filter((l) => l.roadPath && l.roadPath.length > 0)
    .map((l) => ({
      path: l.roadPath!,
      fallback: (l.roadPath?.length ?? 0) <= 2,
      color: DAY_COLORS[Math.max(0, uniqueDates.indexOf(l.date)) % DAY_COLORS.length],
    }));

  // Route stops: ride start pin + every GPS leg location.
  const mapStops: SquiggleStop[] = [];
  if (ride.startLocation?.kind === "gps") {
    mapStops.push({
      lat: ride.startLocation.lat,
      lng: ride.startLocation.lng,
      label: ride.startLocation.name || "Start",
      kind: "start",
    });
  }
  legs.forEach((l, i) => {
    if (l.location?.kind !== "gps") return;
    // Loop rides: skip an end marker that lands on the start pin.
    const loopsHome =
      i === legs.length - 1 &&
      ride.startLocation?.kind === "gps" &&
      Math.abs(l.location.lat - ride.startLocation.lat) < 0.001 &&
      Math.abs(l.location.lng - ride.startLocation.lng) < 0.001;
    if (loopsHome) return;
    mapStops.push({
      lat: l.location.lat,
      lng: l.location.lng,
      label: l.location.name || "",
      kind: i === legs.length - 1 ? "end" : "stop",
    });
  });

  // When a long ride crowds the hero, hide intermediate labels until hover
  // (they always show in the fullscreen overlay) and note the count in the
  // caption so the hidden detail stays discoverable.
  const intermediateCount = mapStops.filter((s) => s.kind === "stop").length;
  const crowded = intermediateCount > 4;

  const mapCaption =
    hasKm && legs.length > 0
      ? `~${formatDistance(totalKm)} · ${totalDays} day${totalDays === 1 ? "" : "s"}${crowded ? ` · +${intermediateCount} stops` : ""}`
      : "";

  return (
    <div class="ride-detail-container">
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
          onClick={() => onNavigate(`#/edit?mode=edit-ride&rideId=${rideId}`)}
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

      <main class="ride-detail-content">
        {/* Hero: kicker, title, route-line trail */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">{dateRange}</span>
          <h1 class="ride-hero-title">{ride.title || 'Untitled Ride'}</h1>
          {stops.length > 0 && <RouteTrail stops={stops} />}
        </section>

        {/* Cumulative Squiggle route map */}
        <section class="ride-map-hero">
          {segments.length > 0 || mapStops.length > 0 ? (
            <div class="map-interactive-trigger" onClick={openMapModal}>
              <SquiggleMap
                segments={segments}
                stops={mapStops}
                width={430}
                height={300}
                compass
                caption={mapCaption}
                revealIntermediateLabels={crowded}
              />
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
              <Button
                variant="secondary"
                size="sm"
                style={{ marginTop: 'var(--spacing-sm)' }}
                onClick={() => onNavigate(`#/edit?mode=new-leg&rideId=${rideId}`)}
              >
                ＋ Add a leg with GPS
              </Button>
            </div>
          )}
        </section>

        {/* Ride statistics spec plate */}
        <section class="ride-stats-card">
          <div class="stat-item">
            <span class="stat-label">Days</span>
            <span class="stat-value">{totalDays}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Legs</span>
            <span class="stat-value">{legs.length}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Distance</span>
            <span class="stat-value">
              {hasKm ? formatDistance(totalKm) : "—"}
            </span>
          </div>
        </section>

        {/* Day-grouped Timeline */}
        <section class="ride-timeline">
          {legs.length === 0 ? (
            <div class="timeline-empty">
              <p>Log your first leg to start your ride book.</p>
              <Button
                variant="primary"
                onClick={() =>
                  onNavigate(`#/edit?mode=new-leg&rideId=${rideId}`)
                }
              >
                ＋ Log First Leg
              </Button>
            </div>
          ) : (
            <div class="timeline-list">
              {uniqueDates.map((date) => {
                const dayLegs = legs.filter((l) => l.date === date);
                const dayNum = uniqueDates.indexOf(date) + 1;
                const dayKm = dayDistances.get(date) || 0;

                return (
                  <div class="day-group" key={date}>
                    <div class="day-group-header">
                      <div class="day-group-title">
                        <span
                          class="day-color-swatch"
                          style={{ background: DAY_COLORS[Math.max(0, dayNum - 1) % DAY_COLORS.length] }}
                        />
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
                      {dayLegs.map((leg) => (
                        <LegCard
                          key={leg.id}
                          leg={leg}
                          index={legs.indexOf(leg)}
                          legs={legs}
                          ride={ride}
                          label={dayLegs.length > 1 ? `Leg ${dayLegs.indexOf(leg) + 1}` : ""}
                        />
                      ))}
                      <DayPhotoRail legs={dayLegs} onNavigate={onNavigate} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Floating Action Button to add new leg */}
      {legs.length > 0 && (
        <div class="fab-container">
          <Button
            variant="fab"
            aria-label="Add Leg"
            onClick={() => onNavigate(`#/edit?mode=new-leg&rideId=${rideId}`)}
          >
            ＋
          </Button>
        </div>
      )}



      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete Ride Logbook?"
          message={`This will permanently delete ${ride.title} and all of its legs. This action cannot be undone.`}
          confirmLabel="Confirm Delete"
          onConfirm={handleDeleteRide}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Fullscreen Map Overlay */}
      <MapModal
        isOpen={showMapModal}
        path={cumulativePath}
        segments={segments}
        stops={mapStops}
        compass
        caption={mapCaption}
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
