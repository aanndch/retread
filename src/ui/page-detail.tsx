import { useState, useEffect } from 'preact/hooks';
import { db } from '../db';
import { Button } from '../components/button';
import { ArrowLeft } from '../components/icons';
import { SquiggleMap } from './squiggle';
import { backfillTripRoutes } from '../road';
import type { Page } from '../types';

interface PageDetailProps {
  pageId: number;
  onNavigate: (route: string) => void;
}

export function PageDetail({ pageId, onNavigate }: PageDetailProps) {
  const [page, setPage] = useState<Page | null>(null);
  const [tripTitle, setTripTitle] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const pageRecord = await db.pages.get(pageId);
        if (!pageRecord) {
          if (active) onNavigate('#/');
          return;
        }

        const tripRecord = await db.trips.get(pageRecord.tripId);
        const tripName = tripRecord ? tripRecord.title : 'Ride Logbook';

        // Set photo object URLs
        const urls = (pageRecord.photos || []).map(blob => URL.createObjectURL(blob));

        if (active) {
          setPage(pageRecord);
          setTripTitle(tripName);
          setPhotoUrls(urls);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load page log details:', err);
        if (active) {
          setLoading(false);
          onNavigate('#/');
        }
      }
    }

    loadData();
    return () => {
      active = false;
      // Clean up object URLs to avoid memory leaks
      photoUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [pageId, onNavigate]);

  const handleDelete = async () => {
    if (!page) return;
    if (!confirm('Are you sure you want to delete this day log entry?')) return;

    try {
      const tripId = page.tripId;
      await db.pages.delete(pageId);

      // Trigger retroactive OSRM re-snapping in background
      await backfillTripRoutes(tripId);

      onNavigate(`#/trip/${tripId}`);
    } catch (err) {
      console.error('Failed to delete day log:', err);
      alert('Failed to delete day.');
    }
  };

  if (loading) {
    return <p class="loading-text">Loading log details...</p>;
  }

  if (!page) return null;

  // Format date display
  const dateParts = page.date.split('-');
  let displayDate = page.date;
  if (dateParts.length === 3) {
    const d = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
    displayDate = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  return (
    <div class="page-detail-container">
      <header class="page-detail-header">
        <Button 
          variant="icon" 
          aria-label="Back" 
          onClick={() => onNavigate(`#/trip/${page.tripId}`)}
        >
          <ArrowLeft />
        </Button>
        <div class="header-titles">
          <h3>{displayDate}</h3>
          <span class="trip-name-sub">{tripTitle}</span>
        </div>
      </header>

      <main class="page-detail-content">
        {/* Single-day route segment map */}
        {page.roadPath && page.roadPath.length >= 2 ? (
          <div class="segment-map-section">
            <span class="segment-map-title">Route Segment Map</span>
            <SquiggleMap path={page.roadPath} />
          </div>
        ) : (
          page.location?.kind === 'gps' && (
            <div class="segment-map-section">
              <span class="segment-map-title">Destination Coordinate</span>
              <SquiggleMap path={[{ lat: page.location.lat, lng: page.location.lng }, { lat: page.location.lat, lng: page.location.lng }]} />
            </div>
          )
        )}

        {/* Distance Stats Badges */}
        <section class="page-metrics-strip">
          {page.km !== null && (
            <div class="metric-badge">
              <span class="badge-label">Leg Distance</span>
              <span class="badge-value">{page.km} km</span>
            </div>
          )}
          {page.odo !== null && (
            <div class="metric-badge">
              <span class="badge-label">Odometer Reading</span>
              <span class="badge-value">{page.odo} km</span>
            </div>
          )}
          {page.location && (
            <div class="metric-badge location-badge-wide">
              <span class="badge-label">Logged Location</span>
              <span class="badge-value">
                📍 {page.location.name || (page.location.kind === 'gps' ? `[${page.location.lat.toFixed(4)}, ${page.location.lng.toFixed(4)}]` : 'None')}
              </span>
            </div>
          )}
        </section>

        {/* Photo Gallery Slideshow Carousel */}
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
                    onClick={() => setActivePhotoIdx((activePhotoIdx - 1 + photoUrls.length) % photoUrls.length)}
                  >
                    ←
                  </Button>
                  <span class="carousel-photo-index">
                    {activePhotoIdx + 1} / {photoUrls.length}
                  </span>
                  <Button 
                    variant="icon" 
                    class="carousel-nav-btn" 
                    onClick={() => setActivePhotoIdx((activePhotoIdx + 1) % photoUrls.length)}
                  >
                    →
                  </Button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Journal Narrative Story note */}
        {page.note && (
          <section class="story-note-section">
            <blockquote class="typewriter-blockquote">
              {page.note}
            </blockquote>
          </section>
        )}

        {/* Action button row */}
        <section class="page-action-row">
          <Button 
            variant="primary" 
            onClick={() => onNavigate(`#/edit?mode=edit&pageId=${pageId}`)}
          >
            Edit Log Details
          </Button>
          <Button 
            variant="secondary" 
            class="btn-danger-text"
            onClick={handleDelete}
          >
            Delete Entry
          </Button>
        </section>
      </main>
    </div>
  );
}
