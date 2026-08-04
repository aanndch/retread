import { useState, useEffect } from 'preact/hooks';
import { Button } from '../components/button';
import { Dropdown } from '../components/dropdown';
import { Toast, useToast } from '../components/toast';
import { CloseIcon, GearIcon } from '../components/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { computeTotalDistance, formatDistance, formatDateRange, buildStopTrail } from '../lib';
import { getSavedTheme, saveTheme, Theme } from '../theme';
import { seedDemoRide } from './seed-demo';
import type { Ride } from '../types';

// "2026-07" -> "JULY 2026"
function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const name = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    .toLocaleDateString(undefined, { month: 'long' });
  return `${name.toUpperCase()} ${year}`;
}

// Sentinel month key for rides that have no legs yet (undated drafts).
const DRAFT_MONTH_KEY = '__drafts';

export function TypewriterKey({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <radialGradient id="chromeBezel" cx="50%" cy="50%" r="50%" fx="30%" fy="30%">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="40%" stop-color="#E1E1E1" />
          <stop offset="70%" stop-color="#9C9C9C" />
          <stop offset="90%" stop-color="#D6D6D6" />
          <stop offset="100%" stop-color="#555555" />
        </radialGradient>
        <radialGradient id="responsiveDarkFace" cx="50%" cy="50%" r="45%" fx="40%" fy="40%">
          <stop offset="0%" stop-color="var(--color-ink)" stop-opacity="0.8" />
          <stop offset="80%" stop-color="var(--color-ink)" stop-opacity="0.95" />
          <stop offset="100%" stop-color="var(--color-ink)" />
        </radialGradient>
        <filter id="subtleWobble" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      {/* Soft shadow */}
      <rect x="4" y="8" width="92" height="88" rx="16" ry="16" fill="var(--color-shadow)" filter="blur(1.5px)" />
      {/* Metallic chrome bezel */}
      <rect x="4" y="4" width="92" height="88" rx="16" ry="16" fill="url(#chromeBezel)" />
      <rect x="7" y="7" width="86" height="82" rx="13" ry="13" fill="#333333" />
      <rect x="8" y="8" width="84" height="80" rx="12" ry="12" fill="#D2D2D2" />
      <rect x="10" y="10" width="80" height="76" rx="10" ry="10" fill="#777777" />
      {/* Responsive dark keycap face */}
      <rect x="11" y="11" width="78" height="74" rx="9" ry="9" fill="url(#responsiveDarkFace)" />
      {/* Inner rim highlight */}
      <rect x="13" y="13" width="74" height="70" rx="8" ry="8" fill="none" stroke="#FFFFFF" stroke-width="0.7" opacity="0.15" />
      {/* Letter R - centered vertically and horizontally */}
      <text 
        x="50" 
        y="52" 
        dominant-baseline="central"
        font-family="Courier New, Courier, monospace" 
        font-weight="900" 
        font-size="44" 
        fill="var(--color-paper)" 
        text-anchor="middle" 
        filter="url(#subtleWobble)"
        style={{ letterSpacing: '0' }}
      >
        R
      </text>
    </svg>
  );
}

interface HomeProps {
  onNavigate: (route: string) => void;
  onReady?: () => void;
}

export function Home({ onNavigate, onReady }: HomeProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [themeMode, setThemeMode] = useState<'system' | Theme>('system');
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [revealRideId, setRevealRideId] = useState<number | null>(null);
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

  // Live query for rides + their first leg's first photo for the cover
  const ridesData = useLiveQuery(async () => {
    const allRides = await db.rides.orderBy('createdAt').reverse().toArray();
    const allLegs = await db.legs.toArray();
    const legsByRide = new Map<number, typeof allLegs>();
    for (const leg of allLegs) {
      const list = legsByRide.get(leg.rideId) || [];
      list.push(leg);
      legsByRide.set(leg.rideId, list);
    }
    
    const list = [];
    
    for (const ride of allRides) {
      const legs = legsByRide.get(ride.id!) || [];
      
      // Find the first leg chronologically that has at least one photo
      const sortedLegs = [...legs].sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        const tA = a.time || '00:00';
        const tB = b.time || '00:00';
        return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
      });
      // A user-picked cover snapshot wins; otherwise fall back to the first
      // chronological leg that has a photo.
      const legWithPhoto = sortedLegs.find(l => l.photos && l.photos.length > 0);
      const customCover = ride.coverBlob ? ride.coverBlob : null;
      // Prefer the small cover thumbnail when available; fall back to full-res
      const firstPhotoBlob = customCover
        ? customCover
        : legWithPhoto
          ? (legWithPhoto.photoThumbs && legWithPhoto.photoThumbs.length > 0
              ? legWithPhoto.photoThumbs[0]
              : legWithPhoto.photos[0])
          : null;
      // Cache key for the cover slot. The blob's content hash is included so a
      // changed cover or changed first photo busts the cached object URL (and
      // the home card updates immediately), while identical bytes on a
      // live-query re-emit still hit the cache and don't flicker.
      const coverFingerprint = firstPhotoBlob ? await blobFingerprint(firstPhotoBlob) : '';
      const coverKey = firstPhotoBlob
        ? customCover
          ? `${ride.id}:cover:${coverFingerprint}`
          : `${legWithPhoto!.id}:0:${coverFingerprint}`
        : '';

      // Compute date range for display
      let dateRange = '';
      if (sortedLegs.length > 0) {
        dateRange = formatDateRange(
          sortedLegs[0].date,
          sortedLegs[sortedLegs.length - 1].date
        );
      }

      // Compile deduped trail of distinct stops
      const stopTrail = buildStopTrail(ride.startLocation, sortedLegs);

      // Month bucket for the ride book: trip start (first leg date). Rides with
      // no legs yet are undated and go into the DRAFTS section instead.
      const startDate = sortedLegs.length > 0 ? sortedLegs[0].date : '';
      const monthKey = startDate ? startDate.slice(0, 7) : DRAFT_MONTH_KEY; // YYYY-MM

      list.push({
        ride,
        totalKm: computeTotalDistance(legs, ride.startOdo),
        firstPhotoBlob,
        coverKey,
        dateRange,
        stopTrail,
        monthKey,
        startDate
      });
    }
    
    return list;
  });

  // Only show skeleton after a 200ms delay to avoid flash on fast loads
  useEffect(() => {
    if (ridesData !== undefined) return;
    const timer = setTimeout(() => setShowSkeleton(true), 200);
    return () => clearTimeout(timer);
  }, [ridesData]);

  // Signal readiness once rides have resolved so the router can fade the view in
  useEffect(() => {
    if (ridesData !== undefined) onReady?.();
  }, [ridesData, onReady]);

  const handleThemeChange = (mode: string) => {
    const theme = mode as 'system' | Theme;
    setThemeMode(theme);
    saveTheme(theme);
  };

  const closeSettings = (afterClose?: () => void) => {
    if (settingsClosing) return;
    if (!showSettings) {
      afterClose?.();
      return;
    }
    setSettingsClosing(true);
    setTimeout(() => {
      setShowSettings(false);
      setSettingsClosing(false);
      afterClose?.();
    }, 250);
  };

  const handleSeedDemoRide = async () => {
    if (seedingDemo) return;
    setSeedingDemo(true);
    try {
      const newRideId = await seedDemoRide();
      // Sequence the reveal: the settings sheet animates out first, letting
      // the freshly added ride card fade in beneath it before the toast lands.
      closeSettings(() => {
        setRevealRideId(newRideId);
        showToast("Demo ride added.", "success");
      });
    } catch (err) {
      console.error("Failed to seed demo data:", err);
      showToast("Error seeding demo data.");
    } finally {
      setSeedingDemo(false);
    }
  };

  // Aggregate stats for the header (only when rides exist)
  const totalRides = ridesData?.length ?? 0;
  const totalKm = (ridesData ?? []).reduce((sum, t) => sum + t.totalKm, 0);

  // Group rides into months of the trip start, newest month first. Rides are
  // fetched by log time, so group explicitly and sort by the trip start date —
  // a backdated ride must land under its own month, not the log order. Rides
  // with no legs (undated) are held out into a DRAFTS section at the bottom.
  interface MonthGroup {
    monthKey: string;
    label: string;
    rides: NonNullable<typeof ridesData>[number][];
    rideCount: number;
    monthKm: number;
    draft?: boolean;
  }
  const byMonth = new Map<string, NonNullable<typeof ridesData>[number][]>();
  for (const entry of ridesData ?? []) {
    const bucket = byMonth.get(entry.monthKey) || [];
    bucket.push(entry);
    byMonth.set(entry.monthKey, bucket);
  }
  const monthGroups: MonthGroup[] = Array.from(byMonth.entries())
    .filter(([key]) => key !== DRAFT_MONTH_KEY)
    .sort((a, b) => b[0].localeCompare(a[0])) // newest month first (YYYY-MM)
    .map(([monthKey, rides]) => {
      const sorted = [...rides].sort((a, b) => {
        const d = b.startDate.localeCompare(a.startDate); // most recent trip first
        if (d !== 0) return d;
        return (b.ride.id || 0) - (a.ride.id || 0);
      });
      return {
        monthKey,
        label: monthLabel(monthKey),
        rides: sorted,
        rideCount: sorted.length,
        monthKm: sorted.reduce((sum, r) => sum + r.totalKm, 0),
      };
    });

  // Undated drafts (no legs yet) always sit after the dated months, newest
  // creation first.
  const draftEntries = byMonth.get(DRAFT_MONTH_KEY) || [];
  if (draftEntries.length > 0) {
    const drafts = [...draftEntries].sort((a, b) => (b.ride.id || 0) - (a.ride.id || 0));
    monthGroups.push({
      monthKey: DRAFT_MONTH_KEY,
      label: 'DRAFTS',
      rides: drafts,
      rideCount: drafts.length,
      monthKm: 0,
      draft: true,
    });
  }

  return (
    <div class="home-container">
      {/* Top Header Bar — pinned like every page top bar */}
      <header class="home-header">
        <div class="home-brand">
          <TypewriterKey size={34} />
          <div class="home-brand-text">
            <h1 class="logo home-logo">retread</h1>
            <p class="tagline home-tagline">For well-tread rides.</p>
          </div>
        </div>
        <Button 
          variant="icon" 
          aria-label="Settings" 
          onClick={() => setShowSettings(true)}
        >
          <GearIcon size={20} />
        </Button>
      </header>

      {/* Book-level stats row, shown once there are rides */}
      {ridesData && ridesData.length > 0 && (
        <div class="book-summary">
          <span class="book-summary-label">Ride Book</span>
          <span class="book-summary-meta">
            {totalRides} {totalRides === 1 ? 'ride' : 'rides'} · {formatDistance(totalKm)}
          </span>
        </div>
      )}

      {/* Settings Panel Overlay */}
      {showSettings && (
        <div class={`modal-backdrop${settingsClosing ? ' closing' : ''}`} onClick={() => closeSettings()}>
          <div class={`modal-content settings-modal${settingsClosing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h3>Settings</h3>
              <Button variant="icon" class="btn-close" aria-label="Close settings" onClick={() => closeSettings()}>
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
                    onClick={() => closeSettings(() => onNavigate('#/backup'))}
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
                    disabled={seedingDemo}
                  >
                    {seedingDemo ? 'Seeding demo ride…' : 'Seed Western Ghats Demo Ride'}
                  </Button>
                </div>
              </div>

              {/* Build Log (changelog/roadmap) */}
              <div class="setting-item">
                <label>Build Log</label>
                <div class="settings-buttons">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => closeSettings(() => onNavigate('#/todo'))}
                  >
                    View Build Log
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <main class="rides-section">

        {ridesData === undefined ? (
          showSkeleton ? (
            <div class="rides-grid">
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
          ) : null
        ) : ridesData.length === 0 ? (
          <div class="empty-state">
            <p class="empty-state-title">Your ride book is empty.</p>
            <p class="empty-state-desc">Everything stays on this device. No account needed.</p>
            <div class="empty-actions">
              <Button 
                variant="primary" 
                onClick={() => onNavigate('#/edit?mode=new-ride')}
              >
                ＋ Log Your First Ride
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleSeedDemoRide}
                disabled={seedingDemo}
              >
                {seedingDemo ? 'Seeding demo ride…' : 'See a Demo Ride'}
              </Button>
            </div>
          </div>
        ) : (
          <div class="ride-book">
            {monthGroups.map((group) => (
              <section class="month-group" key={group.monthKey}>
                <header class="month-group-header">
                  <span class="month-group-label">{group.label}</span>
                  <span class="month-group-meta">
                    {group.rideCount} {group.rideCount === 1 ? 'ride' : 'rides'}
                    {group.monthKm > 0 ? ` · ${formatDistance(group.monthKm)}` : ''}
                  </span>
                </header>
                {group.draft && (
                  <p class="month-group-hint">Add a leg to place this ride on the timeline.</p>
                )}
                <div class="rides-grid">
                  {group.rides.map(({ ride, totalKm, firstPhotoBlob, coverKey, dateRange, stopTrail }) => (
                    <RideCard 
                      key={ride.id} 
                      ride={ride} 
                      totalKm={totalKm} 
                      firstPhotoBlob={firstPhotoBlob} 
                      coverKey={coverKey}
                      dateRange={dateRange}
                      stopTrail={stopTrail}
                      reveal={ride.id === revealRideId}
                      onRevealEnd={() => {
                        if (revealRideId === ride.id) setRevealRideId(null);
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <div class="fab-container">
        <Button 
          variant="fab" 
          aria-label="New Ride" 
          onClick={() => onNavigate('#/edit?mode=new-ride')}
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

// Object URLs for ride cover images, cached by the cover slot (leg + photo
// index). Live-query re-emits hand back fresh Blob references for identical
// bytes, so without this the cover would re-decode and flicker on every emit.
const coverUrlCache = new Map<string, { blob: Blob; url: string }>();

// Content fingerprint of the displayed cover blob, used in the cache key so a
// changed cover (or changed first photo) busts the cached object URL while
// identical bytes keep hitting the cache and don't flicker.
async function blobFingerprint(blob: Blob): Promise<string> {
  try {
    if (crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to size/type below
  }
  return `${blob.size}:${blob.type}`;
}

interface RideCardProps {
  ride: Ride;
  totalKm: number;
  firstPhotoBlob: Blob | null;
  coverKey: string;
  dateRange: string;
  stopTrail: string;
  reveal?: boolean;
  onRevealEnd?: () => void;
}

function RideCard({ ride, totalKm, firstPhotoBlob, coverKey, dateRange, stopTrail, reveal, onRevealEnd }: RideCardProps) {
  const [imgUrl, setImgUrl] = useState('');

  // Reuse the cached object URL for the same cover slot; only create a new one
  // when the cover actually changes (different leg/photo).
  useEffect(() => {
    if (!firstPhotoBlob || !coverKey) return;
    const cached = coverUrlCache.get(coverKey);
    if (cached) {
      setImgUrl(cached.url);
      return;
    }
    const url = URL.createObjectURL(firstPhotoBlob);
    coverUrlCache.set(coverKey, { blob: firstPhotoBlob, url });
    setImgUrl(url);
  }, [firstPhotoBlob, coverKey]);

  return (
    <a
      href={`#/ride/${ride.id}`}
      class={`ride-card-link${reveal ? ' ride-card-reveal' : ''}`}
      onAnimationEnd={(e) => {
        if (reveal && e.animationName === 'fade-in') onRevealEnd?.();
      }}
    >
      <div class="ride-card">
        <div class="ride-cover-container">
          {imgUrl ? (
            <img src={imgUrl} alt={ride.title} class="ride-cover-img" />
          ) : (
            <div class="ride-cover-placeholder">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2" />
                <line x1="12" y1="3" x2="12" y2="7" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="3" y1="12" x2="7" y2="12" />
                <line x1="17" y1="12" x2="21" y2="12" />
              </svg>
            </div>
          )}
        </div>
        <div class="ride-card-details">
          <h4 class="ride-card-title">{ride.title || 'Untitled Ride'}</h4>
          {stopTrail && (
            <div class="ride-card-route">{stopTrail}</div>
          )}
          <div class="ride-card-meta">
            {dateRange && (
              <span class="ride-card-date">{dateRange}</span>
            )}
            {totalKm > 0 && (
              <>
                <span class="ride-card-sep">·</span>
                <span class="ride-card-km">{formatDistance(totalKm)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </a>
  );
}
