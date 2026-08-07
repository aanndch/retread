import { useState, useEffect, useCallback, useMemo, useRef } from "preact/hooks";
import { useLiveQuery } from "dexie-react-hooks";
import { Fragment } from "preact";
import { db } from "../db";
import { Button } from "../components/button";
import { ToastHost, useToast } from "../components/toast";
import { ConfirmModal } from "../components/confirm-modal";
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
import { LegCard } from "./ride-detail/leg-card";
import { HASH_HOME } from "../constants";
import {
  computeTotalDistance,
  formatDistance,
  formatIsoDateToDMY,
  buildTrailStops,
  computeDayDistances,
  stopLabel,
  sortLegs,
} from "../lib";
import type { TrailStop } from "../lib";
import type { Ride, Leg } from "../types";

function DayPhotoRail({ photos, dayLegs, onOpenPhoto }: {
  photos: { url: string; leg: Leg; photoIndex: number }[];
  dayLegs: Leg[];
  onOpenPhoto: (globalIdx: number) => void;
}) {
  const dayLegIds = new Set(dayLegs.map((l) => l.id));
  const dayPhotos = photos.filter((p) => dayLegIds.has(p.leg.id));

  if (dayPhotos.length === 0) return null;

  return (
    <div class="photo-rail" role="list" aria-label="Day photos">
      {dayPhotos.map(({ url }, idx) => (
        <button
          key={idx}
          class="photo-thumb"
          role="listitem"
          aria-label={`Open photo ${idx + 1}`}
          onClick={() => onOpenPhoto(photos.indexOf(dayPhotos[idx]))}
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
  onNavigateBack: (logicalParent: string | null) => void;
  onReady?: () => void;
}

function weekdayFor(date: string): string {
  const parts = date.split("-");
  if (parts.length !== 3) return "";
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

// Position phantom (pin-less) stops evenly between their real neighbours so
// consecutive phantoms never stack on the same spot.
function distributePhantoms(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  count: number
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  for (let k = 1; k <= count; k++) {
    const t = k / (count + 1);
    pts.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return pts;
}

// A trailing phantom has no next real pin, so hang it a short distance past the
// last real pin rather than sitting directly on top of it.
function trailingPhantomPts(
  lastReal: { lat: number; lng: number },
  count: number
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  for (let k = 1; k <= count; k++) {
    pts.push({ lat: lastReal.lat + k * 0.02, lng: lastReal.lng + k * 0.02 });
  }
  return pts;
}

// Builds the ride map's segments and stops with phantom awareness:
// - real GPS legs render their snapped road path as usual (day-colored);
// - a run of pin-less legs becomes a phantom gap, drawn as dashed connectors
//   through evenly-spaced hollow "~ Stop N" markers; the solid road that would
//   span the gap is suppressed (the dashed line reads "uncertain here");
// - a trailing run with no next real pin gets a short dashed stub.
function buildRideMap(
  ride: Ride,
  legs: Leg[],
  dayColorFor: (l: Leg) => string
): { segments: SquiggleSegment[]; stops: SquiggleStop[] } {
  const segments: SquiggleSegment[] = [];
  const stops: SquiggleStop[] = [];

  const startLoc = ride.startLocation?.kind === "gps" ? ride.startLocation : null;
  const startPt = startLoc ? { lat: startLoc.lat, lng: startLoc.lng } : null;
  if (startPt) {
    stops.push({
      lat: startPt.lat,
      lng: startPt.lng,
      label: startLoc!.name || "Start",
      kind: "start",
    });
  }

  let lastRealPt: { lat: number; lng: number } | null = startPt;
  let phantomRun: Leg[] = [];

  const addRealStop = (l: Leg, i: number) => {
    if (l.location?.kind !== "gps") return;
    // Loop rides: skip an end marker that lands on the start pin.
    const loopsHome =
      i === legs.length - 1 &&
      !!startPt &&
      Math.abs(l.location.lat - startPt.lat) < 0.001 &&
      Math.abs(l.location.lng - startPt.lng) < 0.001;
    if (loopsHome) return;
    stops.push({
      lat: l.location.lat,
      lng: l.location.lng,
      label: stopLabel(l.location, i + 1),
      kind: i === legs.length - 1 ? "end" : "stop",
    });
  };

  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (l.location?.kind !== "gps") {
      phantomRun.push(l);
      continue;
    }
    const nextReal = { lat: l.location.lat, lng: l.location.lng };

    if (phantomRun.length > 0) {
      // A phantom gap ends here: replace this leg's solid route with dashed
      // connectors through the phantom markers.
      const prevReal = lastRealPt;
      if (prevReal) {
        const phantoms = distributePhantoms(prevReal, nextReal, phantomRun.length);
        const chain = [prevReal, ...phantoms, nextReal];
        for (let k = 0; k < chain.length - 1; k++) {
          segments.push({ path: [chain[k], chain[k + 1]], fallback: true, color: "var(--color-ink-muted)" });
        }
        phantoms.forEach((p, pi) => {
          const phantomLeg = phantomRun[pi];
          const legNum = i - phantomRun.length + 1 + pi;
          stops.push({ lat: p.lat, lng: p.lng, label: stopLabel(phantomLeg.location, legNum), kind: "phantom" });
        });
      }
      phantomRun = [];
      // (suppressed: this real leg's roadPath spans the phantom gap)
    } else if (l.roadPath && l.roadPath.length > 0) {
      segments.push({
        path: l.roadPath,
        fallback: l.roadPath.length <= 2,
        color: dayColorFor(l),
      });
    }

    addRealStop(l, i);
    lastRealPt = nextReal;
  }

  // Trailing phantoms with no next real pin: dashed stub off the last real pin.
  if (phantomRun.length > 0) {
    const lastReal = lastRealPt;
    if (lastReal) {
      const phantoms = trailingPhantomPts(lastReal, phantomRun.length);
      const chain = [lastReal, ...phantoms];
      for (let k = 0; k < chain.length - 1; k++) {
        segments.push({ path: [chain[k], chain[k + 1]], fallback: true, color: "var(--color-ink-muted)" });
      }
      phantoms.forEach((p, pi) => {
        const phantomLeg = phantomRun[pi];
        const legNum = legs.length - phantomRun.length + 1 + pi;
        stops.push({ lat: p.lat, lng: p.lng, label: stopLabel(phantomLeg.location, legNum), kind: "phantom" });
      });
    }
  }

  return { segments, stops };
}

// Trail labels are capped to one line inside the fixed 64px stop cells. The
// label font is monospace (JetBrains Mono advances ~0.6em per glyph ≈ 5.4px at
// 9px), so 10 glyphs fit the 56px content box. Longer names are cut at a word
// boundary and ellipsized; the full name stays available on hover (title) and
// on the leg card.
const TRAIL_LABEL_MAX_GLYPHS = 10;
function fitTrailLabel(label: string): string {
  if (label.length <= TRAIL_LABEL_MAX_GLYPHS) return label;
  const budget = TRAIL_LABEL_MAX_GLYPHS - 1;
  const spaceAt = label.lastIndexOf(' ', budget - 1);
  const cut = spaceAt > 0 ? spaceAt : budget;
  return `${label.slice(0, cut)}…`;
}

function RouteTrail({ stops, onSelectStop }: {
  stops: TrailStop[];
  onSelectStop: (legId: number) => void;
}) {
  // Stagger each stop's fade-in so the route "unrolls" left-to-right — a slow
  // drip past the viewport edge hints there's more to scroll without a mask.
  const stopStyle = (i: number) => ({ animationDelay: `${i * 80}ms` });

  return (
    <nav class="ride-trail" aria-label="Route stops">
      {stops.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span class="trail-line" aria-hidden="true" />}
          {s.legId != null ? (
            <button
              type="button"
              class={`trail-stop${i === 0 ? " is-start" : ""}${i === stops.length - 1 ? " is-end" : ""}${s.phantom ? " is-phantom" : ""}`}
              style={stopStyle(i)}
              onClick={() => onSelectStop(s.legId!)}
            >
              <span class="trail-dot" aria-hidden="true" />
              <span class="trail-name" title={s.name}>{fitTrailLabel(s.phantom ? `~ ${s.name}` : s.name)}</span>
            </button>
          ) : (
            <span
              class={`trail-stop${i === 0 ? " is-start" : ""}${i === stops.length - 1 ? " is-end" : ""}${s.phantom ? " is-phantom" : ""}`}
              style={stopStyle(i)}
            >
              <span class="trail-dot" aria-hidden="true" />
              <span class="trail-name" title={s.name}>{fitTrailLabel(s.phantom ? `~ ${s.name}` : s.name)}</span>
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export function RideDetail({ rideId, onNavigate, onNavigateBack, onReady }: RideDetailProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  // Page-level modals live in the URL: #/ride/:id?modal=map opens the map,
  // ?modal=photo opens the photo overlay (with ?photo=N for the active photo).
  // Opening pushes the param, closing pops it back to the bare ride route.
  const [photoActiveIdx, setPhotoActiveIdx] = useState(0);
  const [coverSet, setCoverSet] = useState(false);
  const { modal, photo } = useRouteQuery();
  // Deep-link scroll-to + flash from search results (?scrollTo=&q=): `title`
  // targets the ride hero title.
  useScrollHighlight(() => 'ride-title');
  const showPhotoModal = modal === "photo";
  const showMapModal = modal === "map";
  useBodyScrollLock(showMapModal);
  useBodyScrollLock(showPhotoModal);

  const openPhotoModal = (globalIdx: number) => {
    setPhotoActiveIdx(globalIdx);
    openModal("photo", { photo: globalIdx });
  };
  const closePhotoModal = () => closeModal("photo");

  // Fullscreen Map Modal (same URL lifecycle as the photo overlay).
  const openMapModal = () => openModal("map");
  const closeMapModal = () => closeModal("map");

  // Snapshot the current photo as the ride's home cover (immediate persist).
  // Mirrors the leg page: prefer the thumbnail, fall back to the full-size
  // photo blob, revoke the prior cover's cached URL, then toast. The lightbox
  // "Set as cover image" action targets the CURRENT photo index.
  const handleSetCover = async (idx: number) => {
    if (coverSet) return;
    const entry = photoList[idx];
    if (!entry) return;
    const { leg, photoIndex } = entry;
    const thumb = (leg.photoThumbs && leg.photoThumbs[photoIndex]) || (leg.photos && leg.photos[photoIndex]);
    if (!thumb) return;
    for (const [key, cached] of coverUrlCache) {
      if (key.startsWith(`${rideId}:cover:`)) {
        URL.revokeObjectURL(cached.url);
        coverUrlCache.delete(key);
      }
    }
    await db.rides.update(rideId, { coverBlob: thumb });
    setCoverSet(true);
    showToast("Cover image set");
  };

  // The delete confirmation isn't a history entry, so browser back just closes
  // it as a courtesy; route changes unmount it anyway.
  useEffect(() => {
    const handlePopState = () => {
      if (showDeleteModal) setShowDeleteModal(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showDeleteModal]);

  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  const stableNavigate = useCallback((route: string) => {
    onNavigateRef.current(route);
  }, []);

  // Jump the timeline to a leg's card when its trail stop is tapped. The card
  // carries a scroll-margin so it lands clear of the pinned page + day headers.
  const scrollToLeg = (legId: number) => {
    const el = document.getElementById(`leg-card-${legId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Reactive ride + legs: re-fires whenever routes are backfilled (e.g. OSRM
  // snapping finishing after the page mounted), so the map fills in live.
  const liveData = useLiveQuery(
    async () => {
      const rideRecord = await db.rides.get(rideId);
      const legsRecords = await db.legs
        .where("rideId")
        .equals(rideId)
        .toArray();
      const sortedLegs = sortLegs(legsRecords);
      return { ride: rideRecord, legs: sortedLegs };
    },
    [rideId]
  );

  const ride: Ride | null = liveData?.ride ?? null;
  const legs: Leg[] = liveData?.legs ?? [];
  const loading = liveData === undefined;

  // Flattened list of every photo across the ride (day → leg → photo) shared
  // by the day photo rails and the fullscreen overlay, so clicking any
  // thumbnail opens that exact photo in the ride-wide viewer.
  const [photoList, setPhotoList] = useState<{ url: string; leg: Leg; photoIndex: number }[]>([]);
  useEffect(() => {
    const collected: { url: string; leg: Leg; photoIndex: number }[] = [];
    const handles: string[] = [];
    for (const leg of legs) {
      for (let i = 0; i < (leg.photos || []).length; i++) {
        const url = URL.createObjectURL(leg.photos![i]);
        handles.push(url);
        collected.push({ url, leg, photoIndex: i });
      }
    }
    setPhotoList(collected);
    return () => handles.forEach((h) => URL.revokeObjectURL(h));
  }, [legs]);

  // The shared lightbox reads a generic { id, blob } list; each ride photo is
  // one entry keyed by its global index (the same value the ?photo= URL uses).
  const lightboxPhotos: LightboxPhoto[] = useMemo(() => {
    return photoList.map((p, i) => ({
      id: String(i),
      blob: p.leg.photos![p.photoIndex],
      alt: `Photo ${i + 1}`,
    }));
  }, [photoList]);

  // Prev/next inside the photo overlay (swipe pager): replaceState the ?photo=
  // param in place so Back does not stack an entry per photo — the open and
  // close stay a push/pop pair.
  const photoIdxRef = useRef(photoActiveIdx);
  const handlePhotoIdxChange = useCallback(
    (idxOrFn: number | ((i: number) => number)) => {
      const next = typeof idxOrFn === "function" ? idxOrFn(photoIdxRef.current) : idxOrFn;
      photoIdxRef.current = next;
      setPhotoActiveIdx(next);
      setModalPhotoParam(next);
    },
    []
  );
  useEffect(() => {
    photoIdxRef.current = photoActiveIdx;
  }, [photoActiveIdx]);

  // Deep link / Back-restore: ?photo=N in the URL picks the exact overlay photo.
  useEffect(() => {
    if (modal === "photo" && photo !== null) {
      const idx = parseInt(photo, 10);
      if (!Number.isNaN(idx)) setPhotoActiveIdx(idx);
    }
  }, [modal, photo]);

  // The "Cover set" confirmation resets when the overlay closes or the user
  // navigates to a different photo, so a different shot can be set next.
  useEffect(() => {
    setCoverSet(false);
  }, [showPhotoModal, photoActiveIdx]);

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
  const totalKm = computeTotalDistance(legs);
  const hasKm = totalKm > 0;

  // Format date range
  let dateRange = "No days logged yet.";
  if (legs.length > 0) {
    if (totalDays === 1) {
      dateRange = formatIsoDateToDMY(legs[0].date);
    } else {
      dateRange = `${formatIsoDateToDMY(legs[0].date)} — ${formatIsoDateToDMY(legs[legs.length - 1].date)}`;
    }
  }

  // Compile deduped trail of distinct stops + per-day distances
  const trailStops = buildTrailStops(ride.startLocation, legs);
  const dayDistances = computeDayDistances(legs);

  const uniqueDates = Array.from(new Set(legs.map((l) => l.date))).sort();

  // Day-colored map segments + stops, with phantom awareness: pin-less legs
  // become dashed gaps through hollow "~ Stop N" markers.
  const dayColorFor = (l: Leg) =>
    DAY_COLORS[Math.max(0, uniqueDates.indexOf(l.date)) % DAY_COLORS.length];
  const { segments, stops: mapStops } = buildRideMap(ride, legs, dayColorFor);

  // When a long ride crowds the hero, hide intermediate labels until hover
  // (they always show in the fullscreen overlay) and note the count in the
  // caption so the hidden detail stays discoverable.
  const intermediateCount = mapStops.filter((s) => s.kind === "stop").length;
  const crowded = intermediateCount > 4;

  // A route is still being drawn when a pinned leg is missing its roadPath but
  // has a real from-point (ride start pin or an earlier pinned leg) — backfill
  // fills these in moments after a save. Recomputes on every live emit, so the
  // spinner clears on its own once the last roadPath lands.
  let realSeen = ride.startLocation?.kind === "gps";
  const routesPending = legs.some((l) => {
    const isGps = l.location?.kind === "gps";
    const pending = isGps && realSeen && !l.roadPath;
    if (isGps) realSeen = true;
    return pending;
  });

  const mapCaption =
    hasKm && legs.length > 0
      ? `~${formatDistance(totalKm)}${totalDays > 1 ? ` · ${totalDays} day${totalDays === 1 ? "" : "s"}` : ""}${crowded ? ` · +${intermediateCount} stops` : ""}`
      : "";

  return (
    <div class="ride-detail-container">
      {/* Top bar: back + edit + delete */}
      <PageHeader
        onBack={() => onNavigateBack(HASH_HOME)}
        onEdit={() => onNavigate(`#/edit?mode=edit-ride&rideId=${rideId}`)}
        onDelete={() => setShowDeleteModal(true)}
      />

      <main class="ride-detail-content">
        {/* Hero: kicker, title, route-line trail */}
        <section class="ride-hero">
          <span class="ride-hero-kicker">{dateRange}</span>
          <h1 id="ride-title" class="ride-hero-title">{ride.title || 'Untitled Ride'}</h1>
          {trailStops.length > 0 && <RouteTrail stops={trailStops} onSelectStop={scrollToLeg} />}
        </section>

        {/* Cumulative Squiggle route map */}
        <MapHero
          segments={segments}
          stops={mapStops}
          caption={mapCaption}
          revealIntermediateLabels={crowded}
          pending={routesPending}
          onOpen={openMapModal}
          empty={
            <SquiggleEmptyState message="Add GPS pins to draw your ride route map.">
              <Button
                variant="secondary"
                size="sm"
                style={{ marginTop: 'var(--spacing-sm)' }}
                onClick={() => onNavigate(`#/edit?mode=new-leg&rideId=${rideId}`)}
              >
                ＋ Add a leg with GPS
              </Button>
            </SquiggleEmptyState>
          }
        />

        {/* Ride statistics spec plate */}
        <StatPlate
          items={[
            { label: "Days", value: totalDays },
            { label: "Legs", value: legs.length },
            { label: "Distance", value: hasKm ? formatDistance(totalKm) : "—" },
          ]}
        />

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
                    {totalDays > 1 && (
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
                    )}
                    <div class="day-group-body">
                      {dayLegs.map((leg) => (
                        <LegCard
                          key={leg.id}
                          id={`leg-card-${leg.id}`}
                          leg={leg}
                          index={legs.indexOf(leg)}
                          label={dayLegs.length > 1 ? `Leg ${dayLegs.indexOf(leg) + 1}` : ""}
                        />
                      ))}                      <DayPhotoRail photos={photoList} dayLegs={dayLegs} onOpenPhoto={openPhotoModal} />
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
          danger
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

      {/* Fullscreen Photo Lightbox (shared photo-paper design) */}
      <PhotoLightbox
        open={showPhotoModal}
        photos={lightboxPhotos}
        activeId={String(photoActiveIdx)}
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

      <ToastHost toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
