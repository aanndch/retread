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
import { backfillTripRoutes } from "../road";
import { formatIsoDateToDMY } from "../lib";
import type { Page, LocationUnion } from "../types";

interface PageDetailProps {
  pageId: number;
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

export function PageDetail({ pageId, onNavigate, onReady }: PageDetailProps) {
  const [page, setPage] = useState<Page | null>(null);
  const [tripTitle, setTripTitle] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [legDistance, setLegDistance] = useState<number | null>(null);
  const [legNum, setLegNum] = useState(0);
  const [totalLegs, setTotalLegs] = useState(0);
  const [trailStart, setTrailStart] = useState("");
  const [trailEnd, setTrailEnd] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [prevPageId, setPrevPageId] = useState<number | null>(null);
  const [nextPageId, setNextPageId] = useState<number | null>(null);
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
        const pageRecord = await db.pages.get(pageId);
        if (!pageRecord) {
          if (active) onNavigate("#/");
          return;
        }

        const tripRecord = await db.trips.get(pageRecord.tripId);
        const tripName = tripRecord ? tripRecord.title : "Ride Logbook";

        const urls = (pageRecord.photos || []).map((blob) =>
          URL.createObjectURL(blob),
        );

        const allPages = await db.pages
          .where("tripId")
          .equals(pageRecord.tripId)
          .toArray();
        const sorted = [...allPages].sort((a, b) => {
          const dComp = a.date.localeCompare(b.date);
          if (dComp !== 0) return dComp;
          const tA = a.time || '00:00';
          const tB = b.time || '00:00';
          return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
        });
        const myIdx = sorted.findIndex((p) => p.id === pageRecord.id);

        let computedLeg: number | null = null;
        if (pageRecord.km !== null && pageRecord.km !== undefined) {
          computedLeg = pageRecord.km;
        } else if (pageRecord.odo !== null && pageRecord.odo !== undefined) {
          if (myIdx > 0) {
            const prevPage = sorted[myIdx - 1];
            if (prevPage.odo !== null && prevPage.odo !== undefined) {
              computedLeg = pageRecord.odo - prevPage.odo;
              if (computedLeg < 0) computedLeg = null;
            }
          } else if (tripRecord?.startOdo !== null && tripRecord?.startOdo !== undefined) {
            computedLeg = pageRecord.odo - tripRecord.startOdo;
            if (computedLeg < 0) computedLeg = null;
          }
        }

        // Trail: start = trip departure (first leg) or previous leg's end point
        const startLoc =
          myIdx === 0 ? tripRecord?.startLocation : sorted[myIdx - 1]?.location;
        const endLoc = pageRecord.location;

        if (active) {
          setPage(pageRecord);
          setTripTitle(tripName);
          setPhotoUrls(urls);
          photoUrlsRef.current = urls;
          setLegDistance(computedLeg);
          setLegNum(myIdx + 1);
          setTotalLegs(sorted.length);
          setTrailStart(locationName(startLoc));
          setTrailEnd(locationName(endLoc));
          setPrevPageId(myIdx > 0 ? sorted[myIdx - 1].id ?? null : null);
          setNextPageId(myIdx < sorted.length - 1 ? sorted[myIdx + 1].id ?? null : null);
          setPrevDate(myIdx > 0 ? formatIsoDateToDMY(sorted[myIdx - 1].date) : "");
          setNextDate(myIdx < sorted.length - 1 ? formatIsoDateToDMY(sorted[myIdx + 1].date) : "");
          setLoading(false);
          onReady?.();
        }
      } catch (err) {
        console.error("Failed to load page log details:", err);
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
  }, [pageId, onNavigate]);

  const handleDelete = async () => {
    if (!page) return;

    try {
      const tripId = page.tripId;
      await db.pages.delete(pageId);
      await backfillTripRoutes(tripId);
      onNavigate(`#/trip/${tripId}`);
    } catch (err) {
      console.error("Failed to delete day log:", err);
      showToast("Failed to delete day.");
    }
  };

  if (loading) {
    return <p class="loading-text">Loading log details...</p>;
  }

  if (!page) return null;

  const shortDate = formatIsoDateToDMY(page.date);

  return (
    <div class="page-detail-container">
      {/* Top bar: back + edit + delete */}
      <header class="ride-topbar">
        <Button
          variant="icon"
          aria-label="Back"
          onClick={() => onNavigate(`#/trip/${page.tripId}`)}
        >
          <ArrowLeft />
        </Button>
        <div class="ride-topbar-spacer" />
        <Button
          variant="icon"
          aria-label="Edit leg"
          onClick={() => onNavigate(`#/edit?mode=edit&pageId=${pageId}`)}
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

      <main class="page-detail-content">
        {/* Hero: kicker, title, leg route trail */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">
            {tripTitle} · {shortDate}
          </span>
          <h1 class="ride-hero-title">{page.title || "Day Log"}</h1>
          {trailStart && trailEnd && (
            <LegTrail start={trailStart} end={trailEnd} />
          )}
        </section>

        {/* Segment route map */}
        <section class="ride-map-hero">
          {page.roadPath && page.roadPath.length >= 2 ? (
            <div class="map-interactive-trigger" onClick={openMapModal}>
              <SquiggleMap path={page.roadPath} width={430} height={200} />
            </div>
          ) : (
            page.location?.kind === "gps" && (
              <div class="map-interactive-trigger" onClick={() => openMapModal()}>
                <SquiggleMap
                  path={[
                    { lat: page.location.lat, lng: page.location.lng },
                    { lat: page.location.lat, lng: page.location.lng },
                  ]}
                  width={430}
                  height={200}
                />
              </div>
            )
          )}
        </section>

        {/* Leg stats spec plate */}
        <section class="trip-stats-card">
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
              {page.odo !== null && page.odo !== undefined ? page.odo : "—"}
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Time</span>
            <span class="stat-value">{page.time ? page.time : "—"}</span>
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

        {page.note && (
          <section class="story-note-section">
            <span class="note-label">Rider's Note</span>
            <blockquote class="typewriter-blockquote">{page.note}</blockquote>
          </section>
        )}

        {/* Prev / Next leg pager */}
        <section class="leg-pager">
          <Button
            variant="tertiary"
            class="pager-half"
            disabled={prevPageId === null}
            onClick={() => prevPageId !== null && onNavigate(`#/page/${prevPageId}`)}
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
            disabled={nextPageId === null}
            onClick={() => nextPageId !== null && onNavigate(`#/page/${nextPageId}`)}
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
          title="Delete Day Log?"
          message={`This will permanently delete the log entry for ${formatIsoDateToDMY(page.date)}. This action cannot be undone.`}
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
          page.roadPath && page.roadPath.length >= 2
            ? page.roadPath
            : page.location?.kind === "gps"
              ? [
                  { lat: page.location.lat, lng: page.location.lng },
                  { lat: page.location.lat, lng: page.location.lng }
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
