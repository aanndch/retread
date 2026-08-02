import { useState, useEffect } from 'preact/hooks';
import { Button } from '../components/button';
import { GearIcon, CloseIcon } from '../components/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { computeTotalDistance, formatDistance } from '../lib';
import { getSavedTheme, saveTheme } from '../theme';
import { backfillTripRoutes } from '../road';
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

  const handleSeedDemoRide = async () => {
    try {
      // 1. Create the Trip with a departure pin
      const newTripId = await db.trips.add({
        title: "Spiti Valley Loop",
        createdAt: new Date().toISOString(),
        startLocation: { kind: 'gps', lat: 31.1048, lng: 77.1734, name: "Shimla" }
      }) as number;

      // 2. Helper to create SVG mock photos
      const createMockPhoto = (title: string, color: string) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
          <rect width="100%" height="100%" fill="${color}"/>
          <circle cx="400" cy="220" r="100" fill="none" stroke="#fafefe" stroke-width="2" opacity="0.3"/>
          <line x1="400" y1="50" x2="400" y2="390" stroke="#fafefe" stroke-width="1" opacity="0.2"/>
          <line x1="100" y1="220" x2="700" y2="220" stroke="#fafefe" stroke-width="1" opacity="0.2"/>
          <text x="50%" y="450" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="16" fill="#fafefe" letter-spacing="2">${title.toUpperCase()}</text>
          <text x="50%" y="225" dominant-baseline="middle" text-anchor="middle" font-family="serif" font-size="32" font-style="italic" fill="#fafefe">RETREAD LOGS</text>
        </svg>`;
        return new Blob([svg], { type: 'image/svg+xml' });
      };

      // 3. Add 5 detailed Pages (Day 1 gets a route from Trip.startLocation → Sarahan)
      // Day 1: Leg 1
      await db.pages.add({
        tripId: newTripId,
        date: "2026-06-10",
        title: "Shimla to Sarahan (Gateway to Kinnaur)",
        note: "Left Shimla at dawn. The air is crisp and clean as we climb away from the tourist crowds. Navigating the winding tarmac towards Narkanda, the cedar forests smell amazing. Descended into the Sutlej river valley before climbing up to the quiet temple town of Sarahan. Staying in a small guesthouse facing the snow-capped Shrikhand Mahadev peaks.",
        km: 160,
        location: { kind: 'gps', lat: 31.5173, lng: 77.7958, name: "Sarahan" },
        photos: [
          createMockPhoto("Day 1: Winding roads", "#4a5d4e"),
          createMockPhoto("Day 1: Sutlej River Valley", "#5c6d5f")
        ]
      });

      // Day 2: Leg 2
      await db.pages.add({
        tripId: newTripId,
        date: "2026-06-11",
        title: "Sarahan to Sangla (Into Baspa Valley)",
        note: "Rode along the sheer cliff faces of the Hindustan-Tibet Highway. The roads are carved directly into rock here—half-tunnels hanging over the raging Sutlej. Turned off at Karcham into the breathtaking Baspa Valley. The river is turquoise. Camped under the apple orchards in Sangla. Felt the altitude creeping in.",
        km: 95,
        location: { kind: 'gps', lat: 31.4239, lng: 78.2612, name: "Sangla" },
        photos: [
          createMockPhoto("Day 2: Kinnaur Cliffs", "#695e54"),
          createMockPhoto("Day 2: Baspa River Camp", "#546469")
        ]
      });

      // Day 3: Leg 3
      await db.pages.add({
        tripId: newTripId,
        date: "2026-06-12",
        title: "Sangla to Kalpa (Kinnaur Kailash peaks)",
        note: "A short but demanding climb up to Kalpa. Rode through Chitkul—the last Indian village before the Tibet border. The wind was fierce, cold, and pure. Reached Kalpa by afternoon. The giant Kinnaur Kailash massif dominates the sky. Golden hour hitting the peaks was surreal.",
        km: 80,
        location: { kind: 'gps', lat: 31.5385, lng: 78.2561, name: "Kalpa" },
        photos: [
          createMockPhoto("Day 3: Border Outpost in Chitkul", "#586954")
        ]
      });

      // Day 4: Leg 4
      await db.pages.add({
        tripId: newTripId,
        date: "2026-06-13",
        title: "Kalpa to Nako (High-Altitude Desert)",
        note: "Crossed the Khab bridge where Sutlej meets Spiti river. The landscape transitioned from green pine valleys into completely barren, lunar-like brown mountains. Constant wind and gravel patches. Climbed the hairpin loops up to Nako, an ancient village built around a small lake at 3,600m. Visited the 1000-year-old monastery.",
        km: 125,
        location: { kind: 'gps', lat: 31.8797, lng: 78.6276, name: "Nako" },
        photos: [
          createMockPhoto("Day 4: Khab Bridge Junction", "#6e6255")
        ]
      });

      // Day 5: Leg 5
      await db.pages.add({
        tripId: newTripId,
        date: "2026-06-14",
        title: "Nako to Kaza (Heart of Spiti)",
        note: "Rode through the Spiti Valley river bed. Stopped at Tabo Monastery—often called the Ajanta of the Himalayas. The dirt trails leading into Dhankar Monastery were tricky but the views were worth the near-drop. Arrived in Kaza, the sub-divisional capital. Thin air, fluttering prayer flags, and local butter tea.",
        km: 115,
        location: { kind: 'gps', lat: 32.2227, lng: 78.0709, name: "Kaza" },
        photos: [
          createMockPhoto("Day 5: Entering Kaza Valley", "#4b5b5c"),
          createMockPhoto("Day 5: Dhankar Monastery Ridge", "#6e5d5c")
        ]
      });

      // 4. Trigger background snapping
      await backfillTripRoutes(newTripId);

      // 5. Navigate directly to the new trip detail page
      setShowSettings(false);
      onNavigate(`#/trip/${newTripId}`);
    } catch (err) {
      console.error("Failed to seed demo data:", err);
      alert("Error seeding demo data.");
    }
  };

  return (
    <div class="home-container">
      {/* Top Header Bar */}
      <header class="home-header">
        <div>
          <h1 class="logo">retread</h1>
          <p class="tagline">A logbook for well-tread rides.</p>
        </div>
        <Button 
          variant="icon" 
          aria-label="Settings" 
          onClick={() => setShowSettings(!showSettings)}
        >
          <GearIcon />
        </Button>
      </header>

      {/* Settings Panel Overlay */}
      {showSettings && (
        <div class="modal-backdrop" onClick={() => setShowSettings(false)}>
          <div class="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Settings</h3>
              <Button variant="icon" class="btn-close" onClick={() => setShowSettings(false)}>
                <CloseIcon />
              </Button>
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
        <Button 
          variant="fab" 
          aria-label="New Ride" 
          onClick={() => onNavigate('#/edit?mode=new-trip')}
        >
          ✦
        </Button>
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
