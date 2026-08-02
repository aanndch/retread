import { useState, useEffect } from 'preact/hooks';
import { db } from '../db';
import { Button } from '../components/button';
import { ArrowLeft } from '../components/icons';
import { SquiggleMap } from './squiggle';
import { backfillTripRoutes } from '../road';
import type { Trip, Page } from '../types';

interface TripDetailProps {
  tripId: number;
  onNavigate: (route: string) => void;
}

export function TripDetail({ tripId, onNavigate }: TripDetailProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);

  // Load trip and associated page logs on mount/change
  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const tripRecord = await db.trips.get(tripId);
        if (!tripRecord) {
          if (active) onNavigate('#/');
          return;
        }

        const pagesRecords = await db.pages.where('tripId').equals(tripId).toArray();
        // Sort chronologically by date
        const sortedPages = [...pagesRecords].sort((a, b) => a.date.localeCompare(b.date));

        if (active) {
          setTrip(tripRecord);
          setPages(sortedPages);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load ride details:', err);
        if (active) {
          setLoading(false);
          onNavigate('#/');
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [tripId, onNavigate]);

  const handleDeletePage = async (pageId: number, e: Event) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this day log?')) return;

    try {
      await db.pages.delete(pageId);
      // Reload pages
      const pagesRecords = await db.pages.where('tripId').equals(tripId).toArray();
      const sortedPages = [...pagesRecords].sort((a, b) => a.date.localeCompare(b.date));
      setPages(sortedPages);

      // Trigger retroactive OSRM re-snapping on adjacent legs in road.ts
      await backfillTripRoutes(tripId);
    } catch (err) {
      console.error('Failed to delete day log:', err);
      alert('Failed to delete day log.');
    }
  };

  const handleDeleteTrip = async () => {
    if (!confirm('CAUTION: This will delete this ride logbook and all of its daily pages permanently! Proceed?')) return;

    try {
      await db.trips.delete(tripId);
      // Cascade delete pages
      const pagesToDelete = await db.pages.where('tripId').equals(tripId).toArray();
      for (const p of pagesToDelete) {
        await db.pages.delete(p.id!);
      }
      onNavigate('#/');
    } catch (err) {
      console.error('Failed to delete ride logbook:', err);
      alert('Failed to delete ride.');
    }
  };

  if (loading) {
    return <p class="loading-text">Loading ride details...</p>;
  }

  if (!trip) return null;

  // Compile cumulative GPS path segments for squiggle map
  const cumulativePath: { lat: number; lng: number }[] = [];
  pages.forEach(p => {
    if (p.roadPath && p.roadPath.length > 0) {
      cumulativePath.push(...p.roadPath);
    } else if (p.location && p.location.kind === 'gps') {
      cumulativePath.push({ lat: p.location.lat, lng: p.location.lng });
    }
  });

  // Calculate cumulative stats
  const totalDays = pages.length;
  
  // Total KM calculations (sum of daily km, or difference in odometer if entered)
  let totalKm = 0;
  let hasKm = false;
  pages.forEach(p => {
    if (p.km !== null && p.km !== undefined) {
      totalKm += p.km;
      hasKm = true;
    }
  });

  // If no km but odometer endpoints exist, compute difference
  let odoString = '';
  if (pages.length > 0) {
    const odos = pages.map(p => p.odo).filter((o): o is number => o !== null && o !== undefined);
    if (odos.length >= 2) {
      const minOdo = odos[0];
      const maxOdo = odos[odos.length - 1];
      const diff = maxOdo - minOdo;
      if (!hasKm && diff > 0) {
        totalKm = diff;
        hasKm = true;
      }
      odoString = `${minOdo} → ${maxOdo} km`;
    } else if (odos.length === 1) {
      odoString = `${odos[0]} km`;
    }
  }

  // Format date range
  let dateRange = 'No days logged yet.';
  if (pages.length > 0) {
    const formatDate = (isoStr: string) => {
      const parts = isoStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
      }
      return isoStr;
    };
    
    if (pages.length === 1) {
      dateRange = formatDate(pages[0].date);
    } else {
      dateRange = `${formatDate(pages[0].date)} – ${formatDate(pages[pages.length - 1].date)}`;
    }
  }

  return (
    <div class="trip-detail-container">
      <header class="trip-detail-header">
        <Button 
          variant="icon" 
          aria-label="Back" 
          onClick={() => onNavigate('#/')}
        >
          <ArrowLeft />
        </Button>
        <div class="header-titles">
          <h3>{trip.title}</h3>
          <span class="trip-dates-sub">{dateRange}</span>
        </div>
      </header>

      <main class="trip-detail-content">
        {/* Cumulative Squiggle route map */}
        {cumulativePath.length >= 2 ? (
          <SquiggleMap path={cumulativePath} />
        ) : (
          <div class="squiggle-map-empty">
            <span class="empty-icon">🗺</span>
            <p>Log 2+ days with GPS pins to draw your ride route map.</p>
          </div>
        )}

        {/* Ride statistics card */}
        <section class="trip-stats-card">
          <div class="stat-item">
            <span class="stat-label">Total Days</span>
            <span class="stat-value">{totalDays}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Distance</span>
            <span class="stat-value">{hasKm ? `${totalKm.toLocaleString()} km` : '—'}</span>
          </div>
          {odoString && (
            <div class="stat-item">
              <span class="stat-label">Odometer Range</span>
              <span class="stat-value">{odoString}</span>
            </div>
          )}
        </section>

        {/* Timeline Page logs */}
        <section class="trip-timeline">
          <h4>Daily Logs</h4>
          {pages.length === 0 ? (
            <div class="timeline-empty">
              <p>Write your first day log entry to fill this page.</p>
              <Button 
                variant="primary" 
                onClick={() => onNavigate(`#/edit?mode=new-day&tripId=${tripId}`)}
              >
                ＋ Add Day 1 Log
              </Button>
            </div>
          ) : (
            <div class="timeline-list">
              {pages.map((page, index) => {
                const dateParts = page.date.split('-');
                let weekday = '';
                let label = `Day ${index + 1}`;
                
                if (dateParts.length === 3) {
                  const d = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
                  weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
                }

                return (
                  <div 
                    key={page.id} 
                    class="timeline-card-item"
                    onClick={() => onNavigate(`#/page/${page.id}`)}
                  >
                    <div class="timeline-card-side">
                      <span class="day-num">{label}</span>
                      <span class="day-weekday">{weekday}</span>
                    </div>

                    <div class="timeline-card-body">
                      <div class="card-title-row">
                        <span class="card-date-badge">{page.date}</span>
                        {page.location && (
                          <span class="card-location-badge">
                            📍 {page.location.name || (page.location.kind === 'gps' ? 'GPS coordinates' : 'Named Point')}
                          </span>
                        )}
                      </div>

                      {page.title ? (
                        <h5 class="card-day-title">{page.title}</h5>
                      ) : null}

                      {page.note && (
                        <p class="card-note-excerpt">
                          {page.note.length > 95 ? `${page.note.slice(0, 95)}...` : page.note}
                        </p>
                      )}

                      {/* Photo previews row */}
                      {page.photos && page.photos.length > 0 && (
                        <div class="card-photos-strip">
                          {page.photos.slice(0, 4).map((blob, idx) => {
                            const url = URL.createObjectURL(blob);
                            return (
                              <img 
                                key={idx} 
                                src={url} 
                                alt="preview" 
                                class="card-photo-thumbnail" 
                                onLoad={() => URL.revokeObjectURL(url)}
                              />
                            );
                          })}
                          {page.photos.length > 4 && (
                            <span class="more-photos-indicator">+{page.photos.length - 4}</span>
                          )}
                        </div>
                      )}

                      <div class="card-actions-row">
                        {page.km !== null && <span class="card-stat">{page.km} km</span>}
                        {page.odo !== null && <span class="card-stat">Odo: {page.odo}</span>}
                        <div style="flex-grow: 1;"></div>
                        
                        <Button 
                          variant="icon" 
                          class="action-tiny"
                          onClick={(e: Event) => {
                            e.stopPropagation();
                            onNavigate(`#/edit?mode=edit&pageId=${page.id}`);
                          }}
                        >
                          ✎
                        </Button>
                        <Button 
                          variant="icon" 
                          class="action-tiny action-tiny-danger"
                          onClick={(e: Event) => handleDeletePage(page.id!, e)}
                        >
                          ×
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Delete logbook block */}
        <section class="danger-zone">
          <Button variant="secondary" class="btn-danger-text" onClick={handleDeleteTrip}>
            Delete Ride Logbook
          </Button>
        </section>
      </main>

      {/* Floating Action Button to add new day log */}
      {pages.length > 0 && (
        <div class="fab-container">
          <Button 
            variant="fab" 
            aria-label="Add Day" 
            onClick={() => onNavigate(`#/edit?mode=new-day&tripId=${tripId}`)}
          >
            ＋
          </Button>
        </div>
      )}
    </div>
  );
}
