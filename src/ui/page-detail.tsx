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
import { backfillTripRoutes } from "../road";
import type { Page } from "../types";

interface PageDetailProps {
  pageId: number;
  onNavigate: (route: string) => void;
}

export function PageDetail({ pageId, onNavigate }: PageDetailProps) {
  const [page, setPage] = useState<Page | null>(null);
  const [tripTitle, setTripTitle] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [legDistance, setLegDistance] = useState<number | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [prevPageId, setPrevPageId] = useState<number | null>(null);
  const [nextPageId, setNextPageId] = useState<number | null>(null);
  const { toasts, showToast, removeToast } = useToast();

  // Fullscreen Photo Modal states & handlers
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [imgScale, setImgScale] = useState(1);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const photoTouchStart = useRef({ x: 0, y: 0 });
  const photoLastTouchDistance = useRef<number | null>(null);

  // Fullscreen Map Modal states & handlers
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapScale, setMapScale] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isMapDragging, setIsMapDragging] = useState(false);
  const mapTouchStart = useRef({ x: 0, y: 0 });
  const mapLastTouchDistance = useRef<number | null>(null);

  const openPhotoModal = (idx: number) => {
    setActivePhotoIdx(idx);
    setImgScale(1);
    setImgOffset({ x: 0, y: 0 });
    setShowPhotoModal(true);
    history.pushState({ modalOpen: "photo" }, "");
  };

  const closePhotoModal = () => {
    if (showPhotoModal) {
      setShowPhotoModal(false);
      if (history.state && history.state.modalOpen === "photo") {
        history.back();
      }
    }
  };

  const openMapModal = () => {
    setMapScale(1);
    setMapOffset({ x: 0, y: 0 });
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

  useEffect(() => {
    const handlePopState = () => {
      if (showPhotoModal) setShowPhotoModal(false);
      if (showMapModal) setShowMapModal(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [showPhotoModal, showMapModal]);

  // PHOTO GESTURES
  const togglePhotoZoom = (e: MouseEvent) => {
    e.stopPropagation();
    if (imgScale > 1) {
      setImgScale(1);
      setImgOffset({ x: 0, y: 0 });
    } else {
      setImgScale(2.5);
    }
  };

  const handlePhotoTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPhotoDragging(true);
      photoTouchStart.current = {
        x: e.touches[0].clientX - imgOffset.x,
        y: e.touches[0].clientY - imgOffset.y,
      };
      touchStartX.current = e.touches[0].clientX;
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      photoLastTouchDistance.current = dist;
    }
  };

  const handlePhotoTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && isPhotoDragging) {
      if (imgScale > 1) {
        const dx = e.touches[0].clientX - photoTouchStart.current.x;
        const dy = e.touches[0].clientY - photoTouchStart.current.y;
        setImgOffset({ x: dx, y: dy });
      }
    } else if (e.touches.length === 2 && photoLastTouchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / photoLastTouchDistance.current;
      setImgScale(s => Math.max(1, Math.min(4, s * factor)));
      photoLastTouchDistance.current = dist;
    }
  };

  const handlePhotoTouchEnd = (e: TouchEvent) => {
    setIsPhotoDragging(false);
    photoLastTouchDistance.current = null;

    if (imgScale === 1) {
      const deltaX = touchStartX.current - e.changedTouches[0].clientX;
      if (Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          setActivePhotoIdx((i) => (i + 1) % photoUrls.length);
        } else {
          setActivePhotoIdx((i) => (i - 1 + photoUrls.length) % photoUrls.length);
        }
      }
    }
  };

  const handlePhotoMouseDown = (e: MouseEvent) => {
    if (imgScale > 1) {
      setIsPhotoDragging(true);
      photoTouchStart.current = {
        x: e.clientX - imgOffset.x,
        y: e.clientY - imgOffset.y,
      };
    }
  };

  const handlePhotoMouseMove = (e: MouseEvent) => {
    if (isPhotoDragging && imgScale > 1) {
      const dx = e.clientX - photoTouchStart.current.x;
      const dy = e.clientY - photoTouchStart.current.y;
      setImgOffset({ x: dx, y: dy });
    }
  };

  const handlePhotoMouseUp = () => {
    setIsPhotoDragging(false);
  };

  // MAP GESTURES
  const toggleMapZoom = (e: MouseEvent) => {
    e.stopPropagation();
    if (mapScale > 1) {
      setMapScale(1);
      setMapOffset({ x: 0, y: 0 });
    } else {
      setMapScale(2.5);
    }
  };

  const handleMapTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      setIsMapDragging(true);
      mapTouchStart.current = {
        x: e.touches[0].clientX - mapOffset.x,
        y: e.touches[0].clientY - mapOffset.y,
      };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      mapLastTouchDistance.current = dist;
    }
  };

  const handleMapTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && isMapDragging) {
      const dx = e.touches[0].clientX - mapTouchStart.current.x;
      const dy = e.touches[0].clientY - mapTouchStart.current.y;
      setMapOffset({ x: dx, y: dy });
    } else if (e.touches.length === 2 && mapLastTouchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / mapLastTouchDistance.current;
      setMapScale(s => Math.max(1, Math.min(4, s * factor)));
      mapLastTouchDistance.current = dist;
    }
  };

  const handleMapTouchEnd = () => {
    setIsMapDragging(false);
    mapLastTouchDistance.current = null;
  };

  const handleMapMouseDown = (e: MouseEvent) => {
    setIsMapDragging(true);
    mapTouchStart.current = {
      x: e.clientX - mapOffset.x,
      y: e.clientY - mapOffset.y,
    };
  };

  const handleMapMouseMove = (e: MouseEvent) => {
    if (isMapDragging) {
      const dx = e.clientX - mapTouchStart.current.x;
      const dy = e.clientY - mapTouchStart.current.y;
      setMapOffset({ x: dx, y: dy });
    }
  };

  const handleMapMouseUp = () => {
    setIsMapDragging(false);
  };

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

        if (active) {
          setPage(pageRecord);
          setTripTitle(tripName);
          setPhotoUrls(urls);
          photoUrlsRef.current = urls;
          setLegDistance(computedLeg);
          setPrevPageId(myIdx > 0 ? sorted[myIdx - 1].id ?? null : null);
          setNextPageId(myIdx < sorted.length - 1 ? sorted[myIdx + 1].id ?? null : null);
          setLoading(false);
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

  const dateParts = page.date.split("-");
  let displayDate = page.date;
  let shortDate = page.date;
  if (dateParts.length === 3) {
    const d = new Date(
      parseInt(dateParts[0], 10),
      parseInt(dateParts[1], 10) - 1,
      parseInt(dateParts[2], 10),
    );
    displayDate = d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    shortDate = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div class="page-detail-container">
      <header class="detail-header">
        <Button
          variant="icon"
          aria-label="Back"
          onClick={() => onNavigate(`#/trip/${page.tripId}`)}
        >
          <ArrowLeft />
        </Button>
        <div class="header-titles">
          <h3>{page.title || displayDate}</h3>
          <span class="trip-name-sub">
            {page.title ? `${displayDate} • ${tripTitle}` : tripTitle}
          </span>
        </div>
      </header>

      <main class="page-detail-content">
        {page.roadPath && page.roadPath.length >= 2 ? (
          <div class="segment-map-section" onClick={openMapModal}>
            <span class="segment-map-title">Route Segment Map</span>
            <div class="map-interactive-trigger">
              <SquiggleMap path={page.roadPath} />
            </div>
          </div>
        ) : (
          page.location?.kind === "gps" && (
            <div class="segment-map-section" onClick={() => openMapModal()}>
              <span class="segment-map-title">Destination Coordinate</span>
              <div class="map-interactive-trigger">
                <SquiggleMap
                  path={[
                    { lat: page.location.lat, lng: page.location.lng },
                    { lat: page.location.lat, lng: page.location.lng },
                  ]}
                />
              </div>
            </div>
          )
        )}

        <section class="page-metrics-strip">
          {legDistance !== null && (
            <div class="metric-badge">
              <span class="badge-label">Leg Distance</span>
              <span class="badge-value">{legDistance} km</span>
            </div>
          )}
          {page.location && (
            <div class="metric-badge location-badge-wide">
              <span class="badge-label">Logged Location</span>
              <span class="badge-value">
                📍{" "}
                {page.location.name ||
                  (page.location.kind === "gps"
                    ? `[${page.location.lat.toFixed(4)}, ${page.location.lng.toFixed(4)}]`
                    : "None")}
              </span>
            </div>
          )}
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
                    <span class={`carousel-dot${i === activePhotoIdx ? ' active' : ''}`} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {page.note && (
          <section class="story-note-section">
            <blockquote class="typewriter-blockquote">{page.note}</blockquote>
          </section>
        )}

        {/* Bottom action row */}
        <section class="page-action-row">
          <div class="page-nav-group">
            {prevPageId !== null && (
              <Button
                variant="icon"
                aria-label="Previous day"
                onClick={() => onNavigate(`#/page/${prevPageId}`)}
              >
                <ArrowLeft size={14} />
              </Button>
            )}
            <span class="page-nav-label">
              {shortDate}
            </span>
            {nextPageId !== null && (
              <Button
                variant="icon"
                aria-label="Next day"
                onClick={() => onNavigate(`#/page/${nextPageId}`)}
              >
                <ArrowRight size={14} />
              </Button>
            )}
          </div>
          <div class="page-edit-group">
            <Button
              variant="tertiary"
              class="btn-icon-text"
              onClick={() => onNavigate(`#/edit?mode=edit&pageId=${pageId}`)}
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

      {showDeleteModal && (
        <ConfirmModal
          title="Delete Day Log?"
          message={`This will permanently delete the log entry for ${page.date}. This action cannot be undone.`}
          confirmLabel="Confirm Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Fullscreen Photo Zoom Overlay */}
      {showPhotoModal && (
        <div class="modal-backdrop photo-overlay-backdrop" onClick={closePhotoModal}>
          <button type="button" class="btn-close-overlay" aria-label="Close photo" onClick={(e) => { e.stopPropagation(); closePhotoModal(); }}>&times;</button>
          
          <div 
            class="photo-zoom-container"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handlePhotoTouchStart}
            onTouchMove={handlePhotoTouchMove}
            onTouchEnd={handlePhotoTouchEnd}
            onMouseDown={handlePhotoMouseDown}
            onMouseMove={handlePhotoMouseMove}
            onMouseUp={handlePhotoMouseUp}
          >
            <img 
              src={photoUrls[activePhotoIdx]} 
              alt="Zoomed Photo" 
              class="photo-zoomed-img"
              style={{
                transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${imgScale})`,
                transition: isPhotoDragging ? 'none' : 'transform 0.15s ease-out'
              }}
              onDblClick={togglePhotoZoom}
            />
          </div>
          
          {photoUrls.length > 1 && (
            <div class="photo-overlay-dots">
              {photoUrls.map((_, idx) => (
                <span class={`carousel-dot${idx === activePhotoIdx ? ' active' : ''}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Map Overlay */}
      {showMapModal && (
        <div class="modal-backdrop map-overlay-backdrop" onClick={closeMapModal}>
          <button type="button" class="btn-close-overlay" aria-label="Close map" onClick={(e) => { e.stopPropagation(); closeMapModal(); }}>&times;</button>
          
          <div 
            class="map-zoom-container"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleMapTouchStart}
            onTouchMove={handleMapTouchMove}
            onTouchEnd={handleMapTouchEnd}
            onMouseDown={handleMapMouseDown}
            onMouseMove={handleMapMouseMove}
            onMouseUp={handleMapMouseUp}
          >
            <div 
              class="map-zoom-inner"
              style={{
                transform: `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${mapScale})`,
                transition: isMapDragging ? 'none' : 'transform 0.15s ease-out',
                width: '90vw',
                height: '70vh',
                maxWidth: '440px',
                maxHeight: '440px'
              }}
              onDblClick={toggleMapZoom}
            >
              <SquiggleMap 
                path={page.roadPath && page.roadPath.length >= 2 ? page.roadPath : page.location?.kind === "gps" ? [
                  { lat: page.location.lat, lng: page.location.lng },
                  { lat: page.location.lat, lng: page.location.lng }
                ] : []} 
                width={400} 
                height={400} 
                hideWrapper
                hideGrid
              />
            </div>
          </div>
        </div>
      )}

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
