import { useState, useEffect, useRef } from "preact/hooks";
import { db } from "../db";
import { Button } from "../components/button";
import {
  ArrowLeft,
  ArrowRight,
  CloseIcon,
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
  const [dayIndex, setDayIndex] = useState<number>(0);
  const [totalDays, setTotalDays] = useState<number>(0);
  const [prevPageId, setPrevPageId] = useState<number | null>(null);
  const [nextPageId, setNextPageId] = useState<number | null>(null);

  const photoUrlsRef = useRef<string[]>([]);

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
        const sorted = [...allPages].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
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
          }
        }

        if (active) {
          setPage(pageRecord);
          setTripTitle(tripName);
          setPhotoUrls(urls);
          photoUrlsRef.current = urls;
          setLegDistance(computedLeg);
          setDayIndex(myIdx);
          setTotalDays(sorted.length);
          setPrevPageId(myIdx > 0 ? (sorted[myIdx - 1].id ?? null) : null);
          setNextPageId(
            myIdx < sorted.length - 1 ? (sorted[myIdx + 1].id ?? null) : null,
          );
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
      alert("Failed to delete day.");
    }
  };

  if (loading) {
    return <p class="loading-text">Loading log details...</p>;
  }

  if (!page) return null;

  const dateParts = page.date.split("-");
  let displayDate = page.date;
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
          <div class="segment-map-section">
            <span class="segment-map-title">Route Segment Map</span>
            <SquiggleMap path={page.roadPath} />
          </div>
        ) : (
          page.location?.kind === "gps" && (
            <div class="segment-map-section">
              <span class="segment-map-title">Destination Coordinate</span>
              <SquiggleMap
                path={[
                  { lat: page.location.lat, lng: page.location.lng },
                  { lat: page.location.lat, lng: page.location.lng },
                ]}
              />
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
            <div class="carousel-viewport">
              <img
                src={photoUrls[activePhotoIdx]}
                alt={`Photo ${activePhotoIdx + 1}`}
                class="carousel-active-image"
              />

              {photoUrls.length > 1 && (
                <div class="carousel-overlay-controls">
                  <Button
                    variant="icon"
                    class="carousel-nav-btn"
                    aria-label="Previous photo"
                    onClick={() =>
                      setActivePhotoIdx(
                        (activePhotoIdx - 1 + photoUrls.length) %
                          photoUrls.length,
                      )
                    }
                  >
                    ←
                  </Button>
                  <span class="carousel-photo-index">
                    {activePhotoIdx + 1} / {photoUrls.length}
                  </span>
                  <Button
                    variant="icon"
                    class="carousel-nav-btn"
                    aria-label="Next photo"
                    onClick={() =>
                      setActivePhotoIdx((activePhotoIdx + 1) % photoUrls.length)
                    }
                  >
                    →
                  </Button>
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
            <Button
              variant="icon"
              aria-label="Previous day"
              disabled={prevPageId === null}
              onClick={() =>
                prevPageId !== null && onNavigate(`#/page/${prevPageId}`)
              }
            >
              <ArrowLeft size={14} />
            </Button>
            <span class="page-nav-label">
              Day {dayIndex + 1} of {totalDays}
            </span>
            <Button
              variant="icon"
              aria-label="Next day"
              disabled={nextPageId === null}
              onClick={() =>
                nextPageId !== null && onNavigate(`#/page/${nextPageId}`)
              }
            >
              <ArrowRight size={14} />
            </Button>
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
        <div class="modal-backdrop" onClick={() => setShowDeleteModal(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3 style={{ color: "#d9534f" }}>Delete Day Log?</h3>
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
                This will permanently delete the log entry for{" "}
                <strong>{page.date}</strong>. This action cannot be undone.
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
                  onClick={handleDelete}
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
