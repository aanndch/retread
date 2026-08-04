import { useState, useEffect, useRef } from "preact/hooks";
import { db } from "../db";
import { Button } from "../components/button";
import { Toast, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
import {
  ArrowLeft,
  ArrowRight,
  EditIcon,
  TrashIcon,
} from "../components/icons";
import { SquiggleMap } from "./squiggle";
import { MapModal } from "../components/map-modal";
import { PhotoOverlay } from "../components/photo-overlay";
import { backfillRideRoutes } from "../road";
import { formatIsoDateToDMY } from "../lib";
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
  const [leg, setLeg] = useState<Leg | null>(null);
  const [rideTitle, setRideTitle] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [legDistance, setLegDistance] = useState<number | null>(null);
  const [legNum, setLegNum] = useState(0);
  const [totalLegs, setTotalLegs] = useState(0);
  const [trailStart, setTrailStart] = useState("");
  const [trailEnd, setTrailEnd] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [prevLegId, setPrevLegId] = useState<number | null>(null);
  const [nextLegId, setNextLegId] = useState<number | null>(null);
  const [prevDate, setPrevDate] = useState("");
  const [nextDate, setNextDate] = useState("");
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

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const legRecord = await db.legs.get(legId);
        if (!legRecord) {
          if (active) onNavigate("#/");
          return;
        }

        const rideRecord = await db.rides.get(legRecord.rideId);
        const rideName = rideRecord ? rideRecord.title : "Ride Logbook";

        const urls = (legRecord.photos || []).map((blob) =>
          URL.createObjectURL(blob),
        );

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
        const myIdx = sorted.findIndex((l) => l.id === legRecord.id);

        let computedLeg: number | null = null;
        if (legRecord.km !== null && legRecord.km !== undefined) {
          computedLeg = legRecord.km;
        } else if (legRecord.odo !== null && legRecord.odo !== undefined) {
          if (myIdx > 0) {
            const prevLeg = sorted[myIdx - 1];
            if (prevLeg.odo !== null && prevLeg.odo !== undefined) {
              computedLeg = legRecord.odo - prevLeg.odo;
              if (computedLeg < 0) computedLeg = null;
            }
          } else if (rideRecord?.startOdo !== null && rideRecord?.startOdo !== undefined) {
            computedLeg = legRecord.odo - rideRecord.startOdo;
            if (computedLeg < 0) computedLeg = null;
          }
        }

        // Trail: start = ride departure (first leg) or previous leg's end point
        const startLoc =
          myIdx === 0 ? rideRecord?.startLocation : sorted[myIdx - 1]?.location;
        const endLoc = legRecord.location;

        if (active) {
          setLeg(legRecord);
          setRideTitle(rideName);
          setPhotoUrls(urls);
          photoUrlsRef.current = urls;
          setLegDistance(computedLeg);
          setLegNum(myIdx + 1);
          setTotalLegs(sorted.length);
          setTrailStart(locationName(startLoc));
          setTrailEnd(locationName(endLoc));
          setPrevLegId(myIdx > 0 ? sorted[myIdx - 1].id ?? null : null);
          setNextLegId(myIdx < sorted.length - 1 ? sorted[myIdx + 1].id ?? null : null);
          setPrevDate(myIdx > 0 ? formatIsoDateToDMY(sorted[myIdx - 1].date) : "");
          setNextDate(myIdx < sorted.length - 1 ? formatIsoDateToDMY(sorted[myIdx + 1].date) : "");
          setLoading(false);
          onReady?.();
        }
      } catch (err) {
        console.error("Failed to load leg details:", err);
        if (active) {
          setLoading(false);
          onNavigate("#/");
        }
      }
    }

    loadData();
    return () => {
      active = false;
      photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [legId, onNavigate]);

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

  return (
    <div class="leg-detail-container">
      {/* Top bar: back + edit + delete */}
      <header class="ride-topbar">
        <Button
          variant="icon"
          aria-label="Back"
          onClick={() => onNavigate(`#/ride/${leg.rideId}`)}
        >
          <ArrowLeft />
        </Button>
        <div class="ride-topbar-spacer" />
        <Button
          variant="icon"
          aria-label="Edit leg"
          onClick={() => onNavigate(`#/edit?mode=edit&legId=${legId}`)}
        >
          <EditIcon size={14} />
        </Button>
        <Button
          variant="icon"
          class="btn-danger-text btn-icon-text"
          aria-label="Delete leg"
          onClick={() => setShowDeleteModal(true)}
        >
          <TrashIcon size={14} />
        </Button>
      </header>

      <main class="leg-detail-content">
        {/* Hero: kicker, title, leg route trail */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">
            {rideTitle} · {shortDate}
          </span>
          <h1 class="ride-hero-title">{leg.title || "Untitled Leg"}</h1>
          {trailStart && trailEnd && (
            <LegTrail start={trailStart} end={trailEnd} />
          )}
        </section>

        {/* Segment route map */}
        <section class="ride-map-hero">
          {leg.roadPath && leg.roadPath.length >= 2 ? (
            <div class="map-interactive-trigger" onClick={openMapModal}>
              <SquiggleMap path={leg.roadPath} width={430} height={200} />
            </div>
          ) : (
            leg.location?.kind === "gps" && (
              <div class="map-interactive-trigger" onClick={() => openMapModal()}>
                <SquiggleMap
                  path={[
                    { lat: leg.location.lat, lng: leg.location.lng },
                    { lat: leg.location.lat, lng: leg.location.lng },
                  ]}
                  width={430}
                  height={200}
                />
              </div>
            )
          )}
        </section>

        {/* Leg stats spec plate */}
        <section class="ride-stats-card">
          <div class="stat-item">
            <span class="stat-label">Distance</span>
            <span class="stat-value">
              {legDistance !== null && legDistance !== undefined
                ? `${legDistance} km`
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
        path={
          leg.roadPath && leg.roadPath.length >= 2
            ? leg.roadPath
            : leg.location?.kind === "gps"
              ? [
                  { lat: leg.location.lat, lng: leg.location.lng },
                  { lat: leg.location.lat, lng: leg.location.lng }
                ]
              : []
        }
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
