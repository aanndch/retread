/**
 * Curated changelog/roadmap for Retread. This is a hand-maintained summary of
 * shipped features and fixed bugs — not a live issue tracker. Add a line here
 * whenever a feature lands or a bug is fixed.
 */

export type TodoStatus = 'done' | 'open';

export interface TodoItem {
  id: string;
  title: string;
  status: TodoStatus;
  note?: string;
  badge?: string; // e.g. "PHASE 1", "VIEW IDEA", "LOW EFFORT"
}

export interface TodoSection {
  id: string;
  label: string;
  kind?: 'shipped' | 'planned'; // drives the header color
  description?: string;
  items: TodoItem[];
}

export const TODO_SECTIONS: TodoSection[] = [
  {
    id: 'features',
    label: 'Shipped Features',
    kind: 'shipped',
    items: [
      { id: 'whats-new', title: 'What\'s New & Roadmap page', status: 'done', note: 'Changelog tabs for shipped features, bugs, and planned ideas' },
      { id: 'trail', title: 'Scrollable, clickable ride trail', status: 'done', note: 'Each stop on the ride hero scrolls to its leg card' },
      { id: 'ride-name', title: 'Location-free ride name pre-filled on Start', status: 'done', note: 'Auto name is just the date — moving the start pin never rewrites it' },
      { id: 'log-ride', title: '"Log a ride" creates the ride + first leg in one wizard', status: 'done', note: 'Start · Stop · Photos · Story, single save lands you on the ride page' },
      { id: 'gps-consent', title: 'Location asked only on "Use my location"', status: 'done', note: 'No permission prompt on form load' },
      { id: 'distance-simple', title: 'Simpler distance: GPS route or Manual only', status: 'done', note: 'Odometer mode removed — distance comes from the route or a typed km' },
      { id: 'instant-save', title: 'Instant saves with a route-drawing spinner', status: 'done', note: 'Routes re-snap in the background; the map fills in live instead of blocking the save' },
      { id: 'map-picker', title: 'Place search + a stable map picker', status: 'done', note: 'Geocoded search, offline coordinate paste, a center-pin marker, and clean reopens' },
      { id: 'phantom-map', title: 'Phantom stops keep the map honest', status: 'done', note: 'A leg with no pin shows as a dashed "~ Stop N" gap instead of silently dropping off the ride' },
      { id: 'pin-first', title: 'Pin-first ride & leg editor', status: 'done', note: 'GPS pins are the core; names become optional stop labels ("Stop N") so the route map always draws' },
      { id: 'search', title: 'Global ride search', status: 'done', note: 'Find a ride by title, stop, or leg from any screen' },
      { id: 'month-index', title: 'Clickable month index', status: 'done', note: 'Compact month chips that jump to that month on home' },
      { id: 'drafts', title: 'Leg-less rides sit in a DRAFTS section on home', status: 'done' },
      { id: 'month-home', title: 'Month-grouped home ride book', status: 'done', note: 'Sticky month headers with per-month totals' },
      { id: 'ride-overlay', title: 'Ride-wide photo overlay', status: 'done', note: 'Open any photo and swipe across the whole ride' },
      { id: 'reorder', title: 'Reorder leg photos', status: 'done', note: 'Arrange sheet on the leg page and in the editor' },
      { id: 'cover', title: 'Pick any photo as a ride cover', status: 'done', note: 'From the photo overlay or the editor' },
      { id: 'album', title: 'Typewriter photo album mount', status: 'done', note: 'Framed carousel with mechanical counter' },
      { id: 'back-nav', title: 'Clean back navigation', status: 'done', note: 'In-app back pops history; OAuth pages collapse out of the stack' },
      { id: 'single-day', title: 'Single-day ride pages', status: 'done', note: 'Flat leg list, single date in the kicker' },
      { id: 'pager', title: 'Leg pager with titles & day markers', status: 'done' },
      { id: 'demo', title: 'Seedable demo rides', status: 'done', note: 'Western Ghats route + a Spiti ride that exercises phantom stops' },
      { id: 'squiggle', title: 'Hand-drawn squiggle route maps', status: 'done', note: 'Day-colored segments, named start/end pins, compass, and a route caption' },
      { id: 'gdrive', title: 'Google Drive backup, restore & auto-sync', status: 'done', note: 'Compressed, versioned payloads' },
      { id: 'pwa', title: 'PWA install prompt & iOS backup reminder', status: 'done', note: 'Add to Home Screen without hunting the browser menu' },
      { id: 'themes', title: '7 themes with system detection', status: 'done' },
      { id: 'compress', title: 'Automatic photo compression & thumbnails', status: 'done', note: 'EXIF-safe resize on upload keeps backups lean' },
      { id: 'osrm', title: 'Real-road distance measurement', status: 'done', note: 'Routes snap to OpenStreetMap roads via OSRM instead of a straight-line guess' },
    ],
  },
  {
    id: 'bugs',
    label: 'Squashed Bugs',
    kind: 'shipped',
    items: [
      { id: 'map-picker-keyboard', title: 'Keyboard covered the map picker instead of resizing the form', status: 'done', note: 'Graceful keyboard resize plus dark map tiles' },
      { id: 'search-restore', title: 'Search session lost when returning from a result', status: 'done', note: 'Query lives at the shell level so Back restores the overlay' },
      { id: 'map-picker-stability', title: 'Map picker: blank reopen, offline pinning, and geocode robustness', status: 'done', note: 'Stable ref rebuild on every open; offline coordinate paste as a fallback' },
      { id: 'cover-refresh', title: 'Ride cover needed a refresh to update', status: 'done', note: 'Content-hashed cache key' },
      { id: 'gps-name', title: 'Typed location names cleared by GPS detect / map picker', status: 'done' },
      { id: 'iphone-actions', title: 'Editor action bar pushed off-screen on iPhone', status: 'done', note: 'min-height: 0 lets the 100dvh viewport height win' },
      { id: 'dup-leg', title: 'Rapid double-tap could duplicate a leg on save', status: 'done', note: 'Saving locks the button and blocks re-entry' },
      { id: 'editor-flash', title: 'Editor flashed "invalid mode" on back', status: 'done' },
      { id: 'dead-back', title: 'Dead Android back press', status: 'done', note: 'history.length now distinguishes back from forward' },
      { id: 'restore', title: 'GDrive restore threw "transaction committed too early"', status: 'done', note: 'Pre-compute blobs before the Dexie transaction' },
    ],
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    kind: 'planned',
    description:
      'Three clusters rather than unrelated ideas: browse polish (how you find a ride), geo "wow" (maps worth showing off), and route shaping (picking the road a leg actually took). Most ideas are rough — not all have solid plans yet.',
    items: [
      { id: 'rm-tags', title: 'Tags & filters', status: 'open', badge: 'FINDING RIDES', note: 'Semantic recall — "the monsoon ride". Schema bump (backup is at v1), editor chip input, filter UI.' },
      { id: 'rm-gallery', title: 'Photo gallery tab', status: 'open', badge: 'BROWSE', note: 'Global all-photos view (already flatten per-ride for the overlay). Best "show my friends" screen.' },
      { id: 'rm-borders', title: 'State boundaries + realistic grid', status: 'open', badge: 'GEO', note: 'Bundle simplified state GeoJSON (~150–300KB), true lat/lng graticule, keep the hand-drawn look.' },
      { id: 'rm-country-map', title: 'Country map of all trips on home', status: 'open', badge: 'GEO', note: 'The hero and riskiest — depends on boundary data + a fixed projection. Build last.' },
      { id: 'rm-countries', title: 'Other countries in setup', status: 'open', badge: 'SETUP', note: 'Unlock the hardcoded dropdown, add km↔mi conversion, anchor the geo features.' },
      { id: 'rm-route-alt', title: 'Route alternatives per leg', status: 'open', badge: 'ROUTES', note: 'OSRM alternatives=true returns 2–3 options; pick from compact distance · duration cards in the leg editor. Caveat: alternatives often overlap on remote roads — real divergence needs via-points.' },
      { id: 'rm-route-via', title: 'Shape a route with via-points', status: 'open', badge: 'ROUTES', note: 'Tap intermediate stops the leg must pass through ("over the pass, not the highway"). Persist viaPoints on the leg so backfill reproduces the choice instead of resetting to the OSRM default.' },
      { id: 'rm-route-edit', title: 'Change a saved leg\'s route', status: 'open', badge: 'ROUTES', note: '"Route options" on the leg/ride map reopens the picker and updates the stored path + auto distance retroactively.' },
      { id: 'rm-route-profile', title: 'Motorcycle-aware routing', status: 'open', badge: 'ROUTES', note: 'The driving profile ignores two-wheeler-friendly roads; a custom OSRM profile (or self-hosting) changes which routes are offered at all.' },
    ],
  },
  {
    id: 'view-ideas',
    label: 'View Ideas',
    kind: 'planned',
    description:
      'Alternative ways to see the ride book. These are re-skins of the "by when" path rather than new recall paths — nice to show off, but they do not help find a ride the way search or a month index does.',
    items: [
      { id: 'vi-calendar', title: 'Calendar view', status: 'open', note: 'Month grid with trip dots. A visual "when did I ride" — overlaps the month-grouped book, best as a view mode not a page.' },
      { id: 'vi-timeline', title: 'Timeline view', status: 'open', note: 'Chronological feed of rides and legs. Watches for redundancy — the month-grouped home is already a timeline.' },
    ],
  },
];
