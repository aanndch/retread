import { useState, useEffect } from 'preact/hooks';
import { Button } from '../components/button';
import { Dropdown } from '../components/dropdown';
import { Toast, useToast } from '../components/toast';
import { CloseIcon, GearIcon } from '../components/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { computeTotalDistance, formatDistance, formatDateRange } from '../lib';
import { getSavedTheme, saveTheme, Theme } from '../theme';
import { seedDemoRide } from './seed-demo';
import type { Trip } from '../types';

interface HomeProps {
  onNavigate: (route: string) => void;
}

export function Home({ onNavigate }: HomeProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [themeMode, setThemeMode] = useState<'system' | Theme>('system');
  const { toasts, showToast, removeToast } = useToast();

  // Load saved theme preference on mount
  useEffect(() => {
    const saved = getSavedTheme();
    if (saved) {
      setThemeMode(saved);
    } else {
      setThemeMode('system');
    }
  }, []);

  // Live query for trips + their first page's first photo for the cover
  const tripsData = useLiveQuery(async () => {
    const allTrips = await db.trips.orderBy('createdAt').reverse().toArray();
    const allPages = await db.pages.toArray();
    const pagesByTrip = new Map<number, typeof allPages>();
    for (const page of allPages) {
      const list = pagesByTrip.get(page.tripId) || [];
      list.push(page);
      pagesByTrip.set(page.tripId, list);
    }
    
    const list = [];
    
    for (const trip of allTrips) {
      const pages = pagesByTrip.get(trip.id!) || [];
      
      // Find the first page chronologically that has at least one photo
      const sortedPages = [...pages].sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        const tA = a.time || '00:00';
        const tB = b.time || '00:00';
        return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
      });
      const pageWithPhoto = sortedPages.find(p => p.photos && p.photos.length > 0);
      const firstPhotoBlob = pageWithPhoto ? pageWithPhoto.photos[0] : null;

      // Compute date range for display
      let dateRange = '';
      if (sortedPages.length > 0) {
        dateRange = formatDateRange(
          sortedPages[0].date,
          sortedPages[sortedPages.length - 1].date
        );
      }

      list.push({
        trip,
        daysCount: new Set(pages.map(p => p.date)).size,
        totalKm: computeTotalDistance(pages, trip.startOdo),
        firstPhotoBlob,
        dateRange
      });
    }
    
    return list;
  });

  const handleThemeChange = (mode: string) => {
    const theme = mode as 'system' | Theme;
    setThemeMode(theme);
    saveTheme(theme);
  };

  const handleSeedDemoRide = async () => {
    try {
      const newTripId = await seedDemoRide();
      setShowSettings(false);
      onNavigate(`#/trip/${newTripId}`);
    } catch (err) {
      console.error("Failed to seed demo data:", err);
      showToast("Error seeding demo data.");
    }
  };

  return (
    <div class="home-container">
      {/* Top Header Bar */}
      <header class="home-header">
        <div>
          <h1 class="logo">retread</h1>
          {tripsData && tripsData.length === 0 && (
            <p class="tagline home-tagline">A logbook for well-tread rides.</p>
          )}
        </div>
        <Button 
          variant="icon" 
          aria-label="Settings" 
          onClick={() => setShowSettings(true)}
        >
          <GearIcon size={20} />
        </Button>
      </header>

      {/* Settings Panel Overlay */}
      {showSettings && (
        <div class="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div class="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Settings</h3>
              <Button variant="icon" class="btn-close" aria-label="Close settings" onClick={() => setShowSettings(false)}>
                <CloseIcon />
              </Button>
            </div>
            
            <div class="settings-body">
              {/* Theme Toggle */}
              <div class="setting-item">
                <label>Color Theme</label>
                <Dropdown
                  class="drop-up"
                  value={themeMode}
                  onChange={handleThemeChange}
                  options={[
                    { value: 'system', label: 'System Default' },
                    { value: Theme.Daylight, label: 'Daylight (Cream Paper)' },
                    { value: Theme.Nightfall, label: 'Nightfall (Dark Ink)' },
                    { value: Theme.Sepia, label: 'Sepia (Aged Parchment)' },
                    { value: Theme.Midnight, label: 'Midnight (Blue Night)' },
                    { value: Theme.Slate, label: 'Slate (Warm Gray)' },
                    { value: Theme.Monotone, label: 'Monotone (Grayscale)' },
                    { value: Theme.Cyberpunk, label: 'Cyberpunk (Neon Noir)' },
                  ]}
                />
              </div>

              {/* Backup & Restore */}
              <div class="setting-item">
                <label>Data Management</label>
                <div class="settings-buttons">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => { setShowSettings(false); onNavigate('#/backup'); }}
                  >
                    Backup & Restore
                  </Button>
                </div>
              </div>

              {/* Seed Demo Data */}
              <div class="setting-item">
                <label>Demo Content</label>
                <div class="settings-buttons">
                  <Button 
                    variant="primary" 
                    size="sm"
                    onClick={handleSeedDemoRide}
                  >
                    Seed Spiti Valley Demo Ride
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main class="trips-section">
        {tripsData === undefined ? (
          <div class="trips-grid">
            {[1, 2, 3].map(i => (
              <div key={i} class="skeleton-card">
                <div class="skeleton-cover" />
                <div class="skeleton-details">
                  <div class="skeleton-line w60" />
                  <div class="skeleton-line w80" />
                  <div class="skeleton-line w40" />
                </div>
              </div>
            ))}
          </div>
        ) : tripsData.length === 0 ? (
          <div class="empty-state">
            <p class="empty-state-title">No rides logged yet.</p>
            <p class="empty-state-desc">Your rides, stored locally. No account needed.</p>
            <Button 
              variant="primary" 
              onClick={() => onNavigate('#/edit?mode=new-trip')}
            >
              ＋ Start Your First Ride
            </Button>
          </div>
        ) : (
          <div class="trips-grid">
            {tripsData.map(({ trip, totalKm, firstPhotoBlob, dateRange }) => (
              <TripCard 
                key={trip.id} 
                trip={trip} 
                totalKm={totalKm} 
                firstPhotoBlob={firstPhotoBlob} 
                dateRange={dateRange}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <div class="fab-container">
        <Button 
          variant="fab" 
          aria-label="New Ride" 
          onClick={() => onNavigate('#/edit?mode=new-trip')}
        >
          ＋
        </Button>
      </div>

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}

interface TripCardProps {
  trip: Trip;
  totalKm: number;
  firstPhotoBlob: Blob | null;
  dateRange: string;
}

function TripCard({ trip, totalKm, firstPhotoBlob, dateRange }: TripCardProps) {
  const [imgUrl, setImgUrl] = useState('');

  // Handle object URL lifecycle to prevent memory leaks
  useEffect(() => {
    if (!firstPhotoBlob) return;
    const url = URL.createObjectURL(firstPhotoBlob);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [firstPhotoBlob]);

  return (
    <a href={`#/trip/${trip.id}`} class="trip-card-link">
      <div class="trip-card">
        <div class="trip-cover-container">
          {imgUrl ? (
            <img src={imgUrl} alt={trip.title} class="trip-cover-img" />
          ) : (
            <div class="trip-cover-placeholder">
              <span class="placeholder-icon">🛞</span>
            </div>
          )}
        </div>
        <div class="trip-card-details">
          <h4 class="trip-card-title">{trip.title || 'Untitled Ride'}</h4>
          {dateRange && (
            <div class="trip-card-date">{dateRange}</div>
          )}
          {totalKm > 0 && (
            <div class="trip-card-km">{formatDistance(totalKm)}</div>
          )}
        </div>
      </div>
    </a>
  );
}
