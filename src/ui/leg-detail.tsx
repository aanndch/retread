import { useState, useEffect, useRef } from "preact/hooks";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { Button } from "../components/button";
import { Toast, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
import { ArrowLeft, ArrowRight } from "../components/icons";
import { PageHeader } from "../components/page-header";
import { SquiggleMap, DAY_COLORS } from "./squiggle";
import type { SquiggleSegment, SquiggleStop } from "./squiggle";
import { MapModal } from "../components/map-modal";
import { PhotoOverlay } from "../components/photo-overlay";
import { backfillRideRoutes } from "../road";
import { formatIsoDateToDMY, formatDistance } from "../lib";
import type { Leg, LocationUnion } from "../types";

interface LegDetailProps {
  legId: number;
  onNavigate: (route: string) => void;
  onReady?: () => void;
}

function locationName(loc?: LocationUnion | null): string {
  if (!loc) return "";
  if (loc.name) return loc.name;
  if (loc.kind === "gps") {
    return `[${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}]`;
  }
  return "Named";
}

function LegTrail({ start, end }: { start: string; end: string }) {
  return (
    <div class="ride-trail leg-trail" role="img" aria-label={`Route: ${start} to ${end}`}>
      <span class="trail-stop is-start">
        <span class="trail-dot" aria-hidden="true" />
        <span class="trail-name">{start}</span>
      </span>
      <span class="trail-line" aria-hidden="true" />
      <span class="trail-stop is-end">
        <span class="trail-dot" aria-hidden="true" />
        <span class="trail-name">{end}</span>
      </span>
    </div>
  );
}

export function LegDetail({ legId, onNavigate, onReady }: LegDetailProps) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  // Fullscreen Photo Modal states & handlers
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const openPhotoModal = (idx: number) => {
    setActivePhotoIdx(idx);
    setShowPhotoModal(true);
    history.pushState({ modalOpen: "photo" }, "");
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
  };

  // Fullscreen Map Modal states & handlers
  const [showMapModal, setShowMapModal] = useState(false);

  const openMapModal = () => {
    setShowMapModal(true);
    history.pushState({ modalOpen: "map" }, "");
  };

  const closeMapModal = () => {
    setShowMapModal(false);
  };

  useEffect(() => {
    const handlePopState = () => {
      if (showPhotoModal) setShowPhotoModal(false);
      if (showMapModal) setShowMapModal(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showPhotoModal, showMapModal]);

  const photoUrlsRef = useRef<string[]>([]);
  const touchStartX = useRef(0);

  // Reactive leg + ride context: re-fires when routes are backfilled (e.g. OSRM
  // snapping finishing after the page mounted), so the map fills in live.
  const liveData = useLiveQuery(
    async () => {
      const legRecord = await db.legs.get(legId);
      if (!legRecord) return null;
      const rideRecord = await db.rides.get(legRecord.rideId);
      const allLegs = await db.legs
        .where("rideId")
        .equals(legRecord.rideId)
        .toArray();
      const sorted = [...allLegs].sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        const tA = a.time || '00:00';
        const tB = b.time || '00:00';
        return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
      });
      return { leg: legRecord, ride: rideRecord, sorted };
    },
    [legId]
  );

  const leg: Leg | null = liveData?.leg ?? null;
  const sorted = liveData?.sorted ?? [];
  const loading = liveData === undefined;

  // Photo object URLs, recreated whenever the leg's photo set changes.
  useEffect(() => {
    const blobs = leg?.photos || [];
    const urls = blobs.map((blob) => URL.createObjectURL(blob));
    setPhotoUrls(urls);
    photoUrlsRef.current = urls;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [leg]);

  // Fade the page in once the leg data has actually rendered.
  useEffect(() => {
    if (liveData?.leg) onReady?.();
  }, [liveData, onReady]);

  // If the leg no longer exists, bounce back home (guarded to run once).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (liveData === null && !redirectedRef.current) {
      redirectedRef.current = true;
      onNavigate("#/");
    }
  }, [liveData, onNavigate]);

  // Derived display values: pure recomputes on every live emit.
  const rideTitle = liveData?.ride?.title ?? "Ride Logbook";
  const myIdx = leg ? sorted.findIndex((l) => l.id === leg.id) : -1;

  let legDistance: number | null = null;
  if (leg && leg.km !== null && leg.km !== undefined) {
    legDistance = leg.km;
  } else if (leg && leg.odo !== null && leg.odo !== undefined) {
    if (myIdx > 0) {
      const prevLeg = sorted[myIdx - 1];
      if (prevLeg.odo !== null && prevLeg.odo !== undefined) {
        legDistance = leg.odo - prevLeg.odo;
        if (legDistance < 0) legDistance = null;
      }
    } else if (liveData?.ride?.startOdo !== null && liveData?.ride?.startOdo !== undefined) {
      legDistance = leg.odo - liveData.ride.startOdo;
      if (legDistance < 0) legDistance = null;
    }
  }

  // Trail: start = ride departure (first leg) or previous leg's end point
  const startLoc =
    myIdx === 0 ? liveData?.ride?.startLocation : myIdx > 0 ? sorted[myIdx - 1]?.location : undefined;
  const fromLoc: LocationUnion | null | undefined = startLoc;
  const toLoc: LocationUnion | null | undefined = leg?.location;
  const trailStart = fromLoc ? locationName(fromLoc) : "";
  const trailEnd = toLoc ? locationName(toLoc) : "";

  const dayNum = leg ? [...new Set(sorted.map((l) => l.date))].indexOf(leg.date) + 1 : 0;
  const legNum = myIdx + 1;
  const totalLegs = sorted.length;
  const prevLegId = myIdx > 0 ? sorted[myIdx - 1].id ?? null : null;
  const nextLegId = myIdx >= 0 && myIdx < sorted.length - 1 ? sorted[myIdx + 1].id ?? null : null;
  const prevDate = myIdx > 0 ? formatIsoDateToDMY(sorted[myIdx - 1].date) : "";
  const nextDate = myIdx >= 0 && myIdx < sorted.length - 1 ? formatIsoDateToDMY(sorted[myIdx + 1].date) : "";

  const handleDelete = async () => {
    if (!leg) return;

    try {
      const rideId = leg.rideId;
      await db.legs.delete(legId);
      await backfillRideRoutes(rideId);
      onNavigate(`#/ride/${rideId}`);
    } catch (err) {
      console.error("Failed to delete leg:", err);
      showToast("Failed to delete leg.");
    }
  };

  if (loading) {
    return <p class="loading-text">Loading leg details...</p>;
  }

  if (!leg) return null;

  const shortDate = formatIsoDateToDMY(leg.date);

  // Map inputs: day-tinted route segment, named start/end stops, and a
  // single destination pin for GPS-only legs. Day color mirrors the ride
  // page's day-group swatch for continuity when deep-linking into a leg.
  const dayColor = DAY_COLORS[Math.max(0, dayNum - 1) % DAY_COLORS.length];
  const hasRoute = !!leg.roadPath && leg.roadPath.length >= 2;

  const mapSegments: SquiggleSegment[] | undefined = hasRoute
    ? [{ path: leg.roadPath!, fallback: leg.roadPath!.length <= 2, color: dayColor }]
    : undefined;

  const mapStops: SquiggleStop[] = [];
  if (hasRoute) {
    if (fromLoc?.kind === "gps") {
      mapStops.push({
        lat: fromLoc.lat,
        lng: fromLoc.lng,
        label: fromLoc.name || "Start",
        kind: "start",
      });
    }
    if (toLoc?.kind === "gps") {
      const loopsHome =
        fromLoc?.kind === "gps" &&
        Math.abs(toLoc.lat - fromLoc.lat) < 0.001 &&
        Math.abs(toLoc.lng - fromLoc.lng) < 0.001;
      if (!loopsHome) {
        mapStops.push({
          lat: toLoc.lat,
          lng: toLoc.lng,
          label: toLoc.name || "",
          kind: "end",
        });
      }
    }
  } else if (leg.location?.kind === "gps") {
    mapStops.push({
      lat: leg.location.lat,
      lng: leg.location.lng,
      label: leg.location.name || "",
      kind: "end",
    });
  }

  const mapCaption =
    legDistance !== null && legDistance !== undefined ? formatDistance(legDistance) : "";

  return (
    <div class="leg-detail-container">
      {/* Top bar: back + edit + delete */}
      <PageHeader
        onBack={() => onNavigate(`#/ride/${leg.rideId}`)}
        onEdit={() => onNavigate(`#/edit?mode=edit&legId=${legId}`)}
        onDelete={() => setShowDeleteModal(true)}
      />

      <main class="leg-detail-content">
        {/* Hero: kicker, title, leg route trail */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">
            {rideTitle}{dayNum > 0 ? ` · Day ${dayNum}` : ""} · {shortDate}
          </span>
          <h1 class="ride-hero-title">{leg.title || "Untitled Leg"}</h1>
          {trailStart && trailEnd && (
            <LegTrail start={trailStart} end={trailEnd} />
          )}
        </section>

        {/* Segment route map */}
        <section class="ride-map-hero">
          {mapSegments || mapStops.length > 0 ? (
            <div class="map-interactive-trigger" onClick={openMapModal}>
              <SquiggleMap
                segments={mapSegments}
                stops={mapStops}
                caption={mapCaption}
                compass
                width={430}
                height={300}
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
              <p>No map for this leg yet. Add a GPS pin to draw your route.</p>
            </div>
          )}
        </section>

        {/* Leg stats spec plate */}
        <section class="ride-stats-card">
          <div class="stat-item">
            <span class="stat-label">Distance</span>
            <span class="stat-value">
              {legDistance !== null && legDistance !== undefined
                ? formatDistance(legDistance)
                : "—"}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Odo</span>
            <span class="stat-value">
              {leg.odo !== null && leg.odo !== undefined ? leg.odo : "—"}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Time</span>
            <span class="stat-value">{leg.time ? leg.time : "—"}</span>
          </div>
        </section>

        {photoUrls.length > 0 && (
          <section class="gallery-carousel">
            <div
              class="carousel-viewport"
              onTouchStart={(e: TouchEvent) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e: TouchEvent) => {
                const delta = touchStartX.current - e.changedTouches[0].clientX;
                if (Math.abs(delta) > 50) {
                  if (delta > 0) {
                    setActivePhotoIdx((i) => (i + 1) % photoUrls.length);
                  } else {
                    setActivePhotoIdx((i) => (i - 1 + photoUrls.length) % photoUrls.length);
                  }
                }
              }}
            >
              <img
                src={photoUrls[activePhotoIdx]}
                alt={`Photo ${activePhotoIdx + 1}`}
                class="carousel-active-image"
                onClick={() => openPhotoModal(activePhotoIdx)}
                style={{ cursor: "zoom-in" }}
              />

              {photoUrls.length > 1 && (
                <div class="carousel-dots">
                  {photoUrls.map((_, i) => (
                    <span key={i} class={`carousel-dot${i === activePhotoIdx ? ' active' : ''}`} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {leg.note && (
          <section class="story-note-section">
            <span class="note-label">Rider's Note</span>
            <blockquote class="typewriter-blockquote">{leg.note}</blockquote>
          </section>
        )}

        {photoUrls.length === 0 && !leg.note && (
          <section class="timeline-empty">
            <p>A quiet leg — no photos or note yet.</p>
            <Button
              variant="primary"
              onClick={() => onNavigate(`#/edit?mode=edit&legId=${legId}`)}
            >
              Edit This Leg
            </Button>
          </section>
        )}

        {/* Prev / Next leg pager */}
        <section class="leg-pager">
          <Button
            variant="tertiary"
            class="pager-half"
            disabled={prevLegId === null}
            onClick={() => prevLegId !== null && onNavigate(`#/leg/${prevLegId}`)}
          >
            <span class="pager-action">
              <ArrowLeft size={12} />
              <span>Prev</span>
            </span>
            {prevDate && <span class="pager-date">{prevDate}</span>}
          </Button>
          <span class="pager-center">{legNum} / {totalLegs}</span>
          <Button
            variant="tertiary"
            class="pager-half pager-half-right"
            disabled={nextLegId === null}
            onClick={() => nextLegId !== null && onNavigate(`#/leg/${nextLegId}`)}
          >
            <span class="pager-action">
              <span>Next</span>
              <ArrowRight size={12} />
            </span>
            {nextDate && <span class="pager-date">{nextDate}</span>}
          </Button>
        </section>
      </main>

      {showDeleteModal && (
        <ConfirmModal
          title="Delete Leg?"
          message={`This will permanently delete the leg logged on ${formatIsoDateToDMY(leg.date)}. This action cannot be undone.`}
          confirmLabel="Confirm Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Fullscreen Photo Zoom Overlay */}
      <PhotoOverlay
        isOpen={showPhotoModal}
        photoUrls={photoUrls}
        activeIdx={activePhotoIdx}
        setActiveIdx={setActivePhotoIdx}
        onClose={closePhotoModal}
      />

      {/* Fullscreen Map Overlay */}
      <MapModal
        isOpen={showMapModal}
        segments={mapSegments}
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
