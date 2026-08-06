import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { Button } from '../components/button';
import { useHistoryModal } from '../components/use-history-modal';
import { Dropdown } from '../components/dropdown';
import { ToastHost, useToast } from '../components/toast';
import { CloseIcon, GearIcon, PhotoIcon, SearchIcon } from '../components/icons';
import { FieldCard } from '../components/field-card';
import { formatDistance } from '../lib';
import { HASH_PHOTOS } from '../constants';
import { getSavedTheme, saveTheme, Theme } from '../theme';
import { seedDemoRide, seedPhantomDemoRide } from './seed-demo';
import { coverUrlCache, DRAFT_MONTH_KEY, type HomeRideEntry } from './use-ride-book';
import type { Ride } from '../types';

// "2026-07" -> "JULY 2026"
function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const name = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    .toLocaleDateString(undefined, { month: 'long' });
  return `${name.toUpperCase()} ${year}`;
}

// "2026-07" -> "JUL 26" for the compact month index chips.
function monthChipLabel(monthKey: string): string {
  if (monthKey === DRAFT_MONTH_KEY) return 'DRAFTS';
  const [year, month] = monthKey.split('-');
  const name = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
    .toLocaleDateString(undefined, { month: 'short' });
  return `${name.toUpperCase()} ${year.slice(2)}`;
}

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
  ridesData: HomeRideEntry[] | undefined;
  onNavigate: (route: string) => void;
  onOpenSearch: () => void;
  onReady?: () => void;
}

export function Home({ ridesData, onNavigate, onOpenSearch, onReady }: HomeProps) {
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [settingsOpen, openSettings, closeSettingsSession] = useHistoryModal('settings');
  const settingsRef = useRef<HTMLDivElement>(null);
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

  // Close the settings sheet (dismiss): play the exit animation, then pop the
  // modal's own history entry so system Back also dismisses it cleanly.
  const dismissSettings = useCallback((afterClose?: () => void) => {
    if (settingsClosing) return;
    if (!settingsOpen) {
      afterClose?.();
      return;
    }
    setSettingsClosing(true);
    setTimeout(() => {
      setSettingsClosing(false);
      closeSettingsSession();
      afterClose?.();
    }, 250);
  }, [settingsClosing, settingsOpen, closeSettingsSession]);

  // Leave settings for another page: replace the modal's history entry with the
  // destination so Back from that page returns home — no phantom modal entry,
  // and no back()/navigate race. (replace keeps history.length constant, so the
  // router treats it as a pop; home sits at depth 0, so the miscount is benign.)
  const leaveSettings = useCallback((route: string) => {
    if (settingsClosing) return;
    setSettingsClosing(true);
    setTimeout(() => {
      setSettingsClosing(false);
      window.location.replace(route);
    }, 250);
  }, [settingsClosing]);

  // Escape closes the sheet; focus moves into it when it opens.
  useEffect(() => {
    if (!settingsOpen) return;
    settingsRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissSettings();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [settingsOpen, dismissSettings]);

  const seedRide = async (seedFn: () => Promise<number>, successMsg: string) => {
    if (seedingDemo) return;
    setSeedingDemo(true);
    try {
      const newRideId = await seedFn();
      // Sequence the reveal: the settings sheet animates out first, letting
      // the freshly added ride card fade in beneath it before the toast lands.
      dismissSettings(() => {
        setRevealRideId(newRideId);
        showToast(successMsg, "success");
      });
    } catch (err) {
      console.error("Failed to seed demo data:", err);
      showToast("Error seeding demo data.");
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleSeedDemoRide = () => seedRide(seedDemoRide, "Demo ride added.");
  const handleSeedPhantomRide = () => seedRide(seedPhantomDemoRide, "Phantom demo ride added.");

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

  // Jump to a month section (or the drafts section) instead of scrolling.
  const scrollToMonth = (monthKey: string) => {
    const el = document.getElementById(`month-${monthKey}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
        <div class="home-actions">
          <Button
            variant="icon"
            aria-label="Photos"
            onClick={() => onNavigate(HASH_PHOTOS)}
          >
            <PhotoIcon size={18} />
          </Button>
          <Button
            variant="icon"
            aria-label="Search"
            onClick={onOpenSearch}
          >
            <SearchIcon size={18} />
          </Button>
          <Button
            variant="icon"
            aria-label="Settings"
            onClick={openSettings}
          >
            <GearIcon size={20} />
          </Button>
        </div>
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
      {settingsOpen && (
        <div class={`modal-backdrop${settingsClosing ? ' closing' : ''}`} onClick={() => dismissSettings()}>
          <div
            ref={settingsRef}
            tabIndex={-1}
            class={`modal-content settings-modal${settingsClosing ? ' closing' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="modal-header">
              <h3>Settings</h3>
              <button type="button" class="btn-close" aria-label="Close settings" onClick={() => dismissSettings()}>
                <CloseIcon size={16} />
              </button>
            </div>
            
            <div class="settings-body">
              {/* Theme Toggle */}
              <FieldCard label="Color Theme">
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
              </FieldCard>

              {/* Backup & Restore */}
              <FieldCard label="Data Management">
                <div class="settings-buttons">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => leaveSettings('#/backup')}
                  >
                    Backup & Restore
                  </Button>
                </div>
              </FieldCard>

              {/* Seed Demo Data */}
              <FieldCard label="Demo Content">
                <div class="settings-buttons">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSeedDemoRide}
                    disabled={seedingDemo}
                  >
                    {seedingDemo ? 'Seeding demo ride…' : 'Seed Western Ghats Demo Ride'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSeedPhantomRide}
                    disabled={seedingDemo}
                  >
                    {seedingDemo ? 'Seeding demo ride…' : 'Seed Spiti Phantom Demo Ride'}
                  </Button>
                </div>
              </FieldCard>

              {/* What's New (changelog + roadmap) */}
              <FieldCard label="What's New">
                <div class="settings-buttons">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => leaveSettings('#/todo')}
                  >
                    View Build Log
                  </Button>
                </div>
              </FieldCard>
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
            <p class="empty-state-desc">A ride is a trip. A leg is one stretch of that trip — a segment between two stops. Log as many legs as you like.</p>
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
            {monthGroups.length > 1 && (
              <nav class="month-index" aria-label="Jump to month">
                {monthGroups.map((group) => (
                  <button
                    type="button"
                    class="month-index-chip"
                    key={group.monthKey}
                    onClick={() => scrollToMonth(group.monthKey)}
                  >
                    {monthChipLabel(group.monthKey)}
                  </button>
                ))}
              </nav>
            )}
            {monthGroups.map((group) => (
              <section class="month-group" id={`month-${group.monthKey}`} key={group.monthKey}>
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

      <ToastHost toasts={toasts} removeToast={removeToast} />
    </div>
  );
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

export function RideCard({ ride, totalKm, firstPhotoBlob, coverKey, dateRange, stopTrail, reveal, onRevealEnd }: RideCardProps) {
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
    <Link
      href={`/ride/${ride.id}`}
      className={`ride-card-link${reveal ? ' ride-card-reveal' : ''}`}
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
    </Link>
  );
}
