import { useState, useEffect } from 'preact/hooks';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { computeTotalDistance, formatDistance } from '../lib';
import { getSavedTheme, saveTheme } from '../theme';
import type { Trip } from '../types';

interface HomeProps {
  onNavigate: (route: string) => void;
}

export function Home({ onNavigate }: HomeProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');

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
    const list = [];
    
    for (const trip of allTrips) {
      const pages = await db.pages.where('tripId').equals(trip.id!).toArray();
      
      // Find the first page chronologically that has at least one photo
      const sortedPages = [...pages].sort((a, b) => a.date.localeCompare(b.date));
      const pageWithPhoto = sortedPages.find(p => p.photos && p.photos.length > 0);
      const firstPhotoBlob = pageWithPhoto ? pageWithPhoto.photos[0] : null;

      list.push({
        trip,
        daysCount: pages.length,
        totalKm: computeTotalDistance(pages),
        firstPhotoBlob
      });
    }
    
    return list;
  });

  const handleThemeChange = (e: any) => {
    const mode = e.target.value as 'system' | 'light' | 'dark';
    setThemeMode(mode);
    saveTheme(mode);
  };

  return (
    <div class="home-container">
      {/* Top Header Bar */}
      <header class="home-header">
        <div>
          <h1 class="logo">retread</h1>
          <p class="tagline">A logbook for well-tread rides.</p>
        </div>
        <button 
          class="btn-icon" 
          aria-label="Settings" 
          onClick={() => setShowSettings(!showSettings)}
        >
          ⚙
        </button>
      </header>

      {/* Settings Panel Overlay */}
      {showSettings && (
        <div class="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div class="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Settings</h3>
              <button class="btn-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            
            <div class="settings-body">
              {/* Theme Toggle */}
              <div class="setting-item">
                <label>Color Theme</label>
                <select value={themeMode} onChange={handleThemeChange} class="setting-select">
                  <option value="system">System Default</option>
                  <option value="light">Light (Cream Paper)</option>
                  <option value="dark">Dark (Dark Ink/Brown)</option>
                </select>
              </div>

              {/* Backup & Restore */}
              <div class="setting-item">
                <label>Data Management</label>
                <div class="settings-buttons">
                  <button 
                    class="btn btn-secondary btn-sm"
                    onClick={() => { setShowSettings(false); onNavigate('#/backup'); }}
                  >
                    Backup & Restore
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trips list grid */}
      <main class="trips-section">
        {tripsData === undefined ? (
          <p class="loading-text">Reading logbooks...</p>
        ) : tripsData.length === 0 ? (
          <div class="empty-state">
            <p>No rides logged yet.</p>
            <span class="empty-hint">Tap the ✦ below to start your first ride.</span>
          </div>
        ) : (
          <div class="trips-grid">
            {tripsData.map(({ trip, daysCount, totalKm, firstPhotoBlob }) => (
              <TripCard 
                key={trip.id} 
                trip={trip} 
                daysCount={daysCount} 
                totalKm={totalKm} 
                firstPhotoBlob={firstPhotoBlob} 
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <div class="fab-container">
        <button 
          class="btn-fab" 
          aria-label="New Trip" 
          onClick={() => onNavigate('#/edit?mode=new-trip')}
        >
          ✦
        </button>
      </div>
    </div>
  );
}

interface TripCardProps {
  trip: Trip;
  daysCount: number;
  totalKm: number;
  firstPhotoBlob: Blob | null;
}

function TripCard({ trip, daysCount, totalKm, firstPhotoBlob }: TripCardProps) {
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
          <div class="trip-card-meta">
            <span>{daysCount} {daysCount === 1 ? 'day' : 'days'}</span>
            <span class="meta-dot">·</span>
            <span>{formatDistance(totalKm)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}
