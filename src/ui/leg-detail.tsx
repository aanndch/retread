import { useState, useEffect, useRef, useCallback, useMemo } from "preact/hooks";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { Button } from "../components/button";
import { ToastHost, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
import { ArrowLeft, ArrowRight } from "../components/icons";
import { PageHeader } from "../components/page-header";
import { StatPlate } from "../components/stat-plate";
import { useBodyScrollLock } from "../components/use-body-scroll-lock";
import { closeModal, openModal, setModalPhotoParam, useRouteQuery } from "../components/use-route-query";
import { useScrollHighlight } from "../components/use-scroll-highlight";
import { SquiggleEmptyState, DAY_COLORS } from "./squiggle";
import type { SquiggleSegment, SquiggleStop } from "./squiggle";
import { MapModal } from "../components/map-modal";
import { MapHero } from "../components/map-hero";
import { PhotoLightbox, type LightboxPhoto } from "../components/photo-lightbox";
import { coverUrlCache } from "./use-ride-book";
import { PhotoArrangeSheet } from "../components/photo-arrange-sheet";
import { backfillRideRoutes } from "../road";
import { formatIsoDateToDMY, formatDistance, stopLabel, sortLegs } from "../lib";
import type { Leg, LocationUnion } from "../types";

interface LegDetailProps {
  legId: number;
  onNavigate: (route: string) => void;
  onNavigateBack: (logicalParent: string | null) => void;
  onReady?: () => void;
}

export function LegDetail({ legId, onNavigate, onNavigateBack, onReady }: LegDetailProps) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [coverSet, setCoverSet] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Page-level modals live in the URL (#/leg/:id?modal=map|photo|arrange):
  // opening pushes the param, closing pops it back to the bare leg route.
  const { modal, photo } = useRouteQuery();
  // Deep-link scroll-to + flash from search results (?scrollTo=&q=): `note`
  // targets the leg blockquote, `title` the hero title.
  useScrollHighlight((target) => (target === 'note' ? 'leg-note' : 'leg-title'));
  const showArrange = modal === "arrange";
  const showPhotoModal = modal === "photo";
  const showMapModal = modal === "map";
  useBodyScrollLock(showMapModal);
  useBodyScrollLock(showPhotoModal);
  useBodyScrollLock(showArrange);
  const openArrange = () => openModal("arrange");
  const closeArrange = () => closeModal("arrange");
  const { toasts, showToast, removeToast } = useToast();

  const openPhotoModal = (idx: number) => {
    setActivePhotoIdx(idx);
    openModal("photo", { photo: idx });
  };
  const closePhotoModal = () => closeModal("photo");

  const openMapModal = () => openModal("map");
  const closeMapModal = () => closeModal("map");

  // Persist the reordered photo arrays; the live query re-renders the carousel.
  const handleArrangeSave = async (order: number[]) => {
    if (!leg) return;
    const originalPhotos = leg.photos || [];
    const originalThumbs = leg.photoThumbs || [];
    const photos = order.map((i) => originalPhotos[i]).filter(Boolean);
    const photoThumbs = order.map((i) => originalThumbs[i]).filter(Boolean);
    await db.legs.update(legId, { photos, photoThumbs });
    closeArrange();
    setActivePhotoIdx(0);
    showToast("Photo order saved.");
  };

  // Snapshot the current photo as the ride's home cover (immediate persist).
  // Mirrors the editor's cover-setting mechanism: prefer the thumbnail, fall
  // back to the full-size photo blob. The lightbox "Set as cover image" action
  // targets the CURRENT photo index.
  const handleSetCover = async (idx: number) => {
    if (!leg || coverSet) return;
    const thumb = (leg.photoThumbs && leg.photoThumbs[idx]) || (leg.photos && leg.photos[idx]);
    if (!thumb) return;
    // Revoke the previous cover's cached object URL so a new cover doesn't
    // leave a stale URL behind (the home book caches cover URLs by content).
    for (const [key, entry] of coverUrlCache) {
      if (key.startsWith(`${leg.rideId}:cover:`)) {
        URL.revokeObjectURL(entry.url);
        coverUrlCache.delete(key);
      }
    }
    await db.rides.update(leg.rideId, { coverBlob: thumb });
    setCoverSet(true);
    showToast("Cover image set");
  };

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
      const sorted = sortLegs(allLegs);
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

  // The shared lightbox reads a generic { id, blob } list; each leg photo is one
  // entry keyed by its array index (the same value the ?photo= URL uses).
  const lightboxPhotos: LightboxPhoto[] = useMemo(() => {
    const blobs = leg?.photos || [];
    return blobs.map((blob, i) => ({
      id: String(i),
      blob,
      alt: `Photo ${i + 1}`,
    }));
  }, [leg]);

  // The "Cover set" confirmation resets when the overlay closes or the user
  // navigates to a different photo, so a different shot can be set next.
  useEffect(() => {
    setCoverSet(false);
  }, [showPhotoModal, activePhotoIdx]);

  // Prev/next inside the photo overlay (swipe pager): replaceState the ?photo=
  // param in place so Back does not stack an entry per photo — the open and
  // close stay a push/pop pair.
  const photoIdxRef = useRef(activePhotoIdx);
  const handlePhotoIdxChange = useCallback(
    (idxOrFn: number | ((i: number) => number)) => {
      const next = typeof idxOrFn === "function" ? idxOrFn(photoIdxRef.current) : idxOrFn;
      photoIdxRef.current = next;
      setActivePhotoIdx(next);
      setModalPhotoParam(next);
    },
    []
  );
  useEffect(() => {
    photoIdxRef.current = activePhotoIdx;
  }, [activePhotoIdx]);

  // Deep link / Back-restore: ?photo=N in the URL picks the exact overlay photo.
  useEffect(() => {
    if (modal === "photo" && photo !== null) {
      const idx = parseInt(photo, 10);
      if (!Number.isNaN(idx)) setActivePhotoIdx(idx);
    }
  }, [modal, photo]);

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
  }

  const uniqueDates = [...new Set(sorted.map((l) => l.date))];
  const dayNumFor = (date: string) => uniqueDates.indexOf(date) + 1;
  const dayNum = leg ? dayNumFor(leg.date) : 0;
  const legNum = myIdx + 1;
  const totalLegs = sorted.length;

  const startLoc =
    myIdx === 0 ? liveData?.ride?.startLocation : myIdx > 0 ? sorted[myIdx - 1]?.location : undefined;
  const fromLoc: LocationUnion | null | undefined = startLoc;
  const toLoc: LocationUnion | null | undefined = leg?.location;

  const prevLeg = myIdx > 0 ? sorted[myIdx - 1] : null;
  const nextLeg = myIdx >= 0 && myIdx < sorted.length - 1 ? sorted[myIdx + 1] : null;
  const prevLegId = prevLeg?.id ?? null;
  const nextLegId = nextLeg?.id ?? null;
  // A day boundary is only worth signalling when the adjacent leg starts a new
  // day; same-day legs show just the title since they share this leg's day.
  const prevDayChange = prevLeg ? prevLeg.date !== leg?.date : false;
  const nextDayChange = nextLeg ? nextLeg.date !== leg?.date : false;
  const prevLegDay = prevLeg ? dayNumFor(prevLeg.date) : 0;
  const nextLegDay = nextLeg ? dayNumFor(nextLeg.date) : 0;

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

  // A route is still being drawn when this pinned leg is missing its roadPath
  // but has a from-point (ride start pin or an earlier pinned leg).
  const routePending =
    leg.location?.kind === "gps" &&
    !hasRoute &&
    (myIdx > 0
      ? sorted.slice(0, myIdx).some((p) => p.location?.kind === "gps")
      : liveData?.ride?.startLocation?.kind === "gps");

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
          label: stopLabel(toLoc, legNum),
          kind: "end",
        });
      }
    }
  } else if (leg.location?.kind === "gps") {
    mapStops.push({
      lat: leg.location.lat,
      lng: leg.location.lng,
      label: stopLabel(leg.location, legNum),
      kind: "end",
    });
  }

  const mapCaption =
    legDistance !== null && legDistance !== undefined ? formatDistance(legDistance) : "";

  return (
    <div class="leg-detail-container">
      {/* Top bar: back + edit + delete */}
      <PageHeader
        onBack={() => onNavigateBack(`#/ride/${leg.rideId}`)}
        onEdit={() => onNavigate(`#/edit?mode=edit&legId=${legId}`)}
        onDelete={() => setShowDeleteModal(true)}
      />

      <main class="leg-detail-content">
        {/* Hero: kicker, title */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">
            {rideTitle}{dayNum > 0 ? ` · Day ${dayNum}` : ""} · {shortDate}
          </span>
          <h1 id="leg-title" class="ride-hero-title">{leg.title || "Untitled Leg"}</h1>
        </section>

        <MapHero
          segments={mapSegments}
          stops={mapStops}
          caption={mapCaption}
          pending={routePending}
          onOpen={openMapModal}
          empty={
            <SquiggleEmptyState message="This stop has no exact location — set its pin to draw it here.">
              <Button
                variant="secondary"
                size="sm"
                style={{ marginTop: 'var(--spacing-sm)' }}
                onClick={() => onNavigate(`#/edit?mode=edit&legId=${legId}`)}
              >
                📍 Set this stop's pin
              </Button>
            </SquiggleEmptyState>
          }
        />

        {/* Leg stats spec plate */}
        <StatPlate
          items={[
            { label: "Distance", value: legDistance !== null && legDistance !== undefined ? formatDistance(legDistance) : "—" },
            { label: "Time", value: leg.time ? leg.time : "—" },
          ]}
        />

        {photoUrls.length > 0 && (
          <section class="gallery-carousel">
            <div class="gallery-card">
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
              </div>

              <div class="carousel-caption">
                <span class="carousel-counter">
                  PHOTO {String(activePhotoIdx + 1).padStart(2, "0")} / {String(photoUrls.length).padStart(2, "0")}
                </span>
                <div class="carousel-caption-right">
                  {photoUrls.length > 1 && (
                    <div class="carousel-index">
                      {photoUrls.map((_, i) => (
                        <span key={i} class={`carousel-index-mark${i === activePhotoIdx ? " active" : ""}`} />
                      ))}
                    </div>
                  )}
                  <button type="button" class="btn-arrange" onClick={openArrange}>
                    Arrange
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        <PhotoArrangeSheet
          isOpen={showArrange}
          photoUrls={photoUrls}
          onSave={handleArrangeSave}
          onClose={closeArrange}
        />

        {leg.note && (
          <section class="story-note-section">
            <span class="note-label">Rider's Note</span>
            <blockquote id="leg-note" class="typewriter-blockquote">{leg.note}</blockquote>
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
            {prevLeg && (
              <>
                <span class="pager-leg-title">{prevLeg.title || "Untitled Leg"}</span>
                {prevDayChange && prevLegDay > 0 && (
                  <span class="pager-day">Day {prevLegDay}</span>
                )}
              </>
            )}
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
            {nextLeg && (
              <>
                <span class="pager-leg-title">{nextLeg.title || "Untitled Leg"}</span>
                {nextDayChange && nextLegDay > 0 && (
                  <span class="pager-day">Day {nextLegDay}</span>
                )}
              </>
            )}
          </Button>
        </section>
      </main>

      {showDeleteModal && (
        <ConfirmModal
          title="Delete Leg?"
          danger
          message={`This will permanently delete the leg logged on ${formatIsoDateToDMY(leg.date)}. This action cannot be undone.`}
          confirmLabel="Confirm Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Fullscreen Photo Lightbox (shared photo-paper design) */}
      <PhotoLightbox
        open={showPhotoModal}
        photos={lightboxPhotos}
        activeId={String(activePhotoIdx)}
        onNavigate={(id) => handlePhotoIdxChange(parseInt(id, 10))}
        onClose={closePhotoModal}
        footer={({ index }) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleSetCover(index)}
            disabled={coverSet}
          >
            {coverSet ? "✓ Cover set" : "Set as cover image"}
          </Button>
        )}
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

      <ToastHost toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
