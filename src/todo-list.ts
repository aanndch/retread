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
      { id: 'cover', title: 'Pick any photo as a ride cover', status: 'done', note: 'From the photo overlay or the editor' },
      { id: 'reorder', title: 'Reorder leg photos', status: 'done', note: 'Arrange sheet on the leg page and in the editor' },
      { id: 'month-home', title: 'Month-grouped home ride book', status: 'done', note: 'Sticky month headers with per-month totals' },
      { id: 'ride-overlay', title: 'Ride-wide photo overlay', status: 'done', note: 'Open any photo and swipe across the whole ride' },
      { id: 'gdrive', title: 'Google Drive backup, restore & auto-sync', status: 'done', note: 'Compressed, versioned payloads' },
      { id: 'back-nav', title: 'Clean back navigation', status: 'done', note: 'In-app back pops history; OAuth pages collapse out of the stack' },
      { id: 'single-day', title: 'Single-day ride pages', status: 'done', note: 'Flat leg list, single date in the kicker' },
      { id: 'pager', title: 'Leg pager with titles & day markers', status: 'done' },
      { id: 'distance', title: 'Consistent distance formatting', status: 'done' },
      { id: 'album', title: 'Typewriter photo album mount', status: 'done', note: 'Framed carousel with mechanical counter' },
      { id: 'themes', title: '7 themes with system detection', status: 'done' },
      { id: 'demo', title: 'Seedable Western Ghats demo ride', status: 'done' },
    ],
  },
  {
    id: 'bugs',
    label: 'Squashed Bugs',
    kind: 'shipped',
    items: [
      { id: 'restore', title: 'GDrive restore threw "transaction committed too early"', status: 'done', note: 'Pre-compute blobs before the Dexie transaction' },
      { id: 'gps-name', title: 'Location name cleared by GPS detect / map picker', status: 'done' },
      { id: 'dead-back', title: 'Dead Android back press', status: 'done', note: 'history.length now distinguishes back from forward' },
      { id: 'editor-flash', title: 'Editor flashed "invalid mode" on back', status: 'done' },
      { id: 'cover-overlap', title: 'Overlay cover button overlapped the page dots', status: 'done', note: 'Unified bottom bar with a counter' },
      { id: 'cover-refresh', title: 'Ride cover needed a refresh to update', status: 'done', note: 'Content-hashed cache key' },
      { id: 'map-icon', title: 'Emoji map icon on "Pick on Map"', status: 'done', note: 'Replaced with a drawn icon' },
      { id: 'trail-dot', title: 'Trail end dot not filled on short trails', status: 'done' },
      { id: 'iphone-actions', title: 'Editor action bar pushed off-screen on iPhone', status: 'done', note: 'min-height: 0 lets the 100dvh viewport height win' },
    ],
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    kind: 'planned',
    description:
      'Two clusters rather than unrelated ideas: browse polish (how you find a ride) and geo "wow" (maps worth showing off). Most ideas are rough — not all have solid plans yet.',
    items: [
      { id: 'rm-month-index', title: 'Clickable month index', status: 'open', badge: 'FINDING RIDES', note: 'My top pick for the "scroll forever" problem. Compact month chips (JUL 24 · AUG 24…) at the top that jump to that month. Cheap, directly fixes the pain.' },
      { id: 'rm-search', title: 'Search rides', status: 'open', badge: 'FINDING RIDES', note: 'Filter the home query in memory by title, stop names, locations and leg titles. Biggest unlock for recalling a ride by name.' },
      { id: 'rm-tags', title: 'Tags & filters', status: 'open', badge: 'FINDING RIDES', note: 'Semantic recall — "the monsoon ride". Schema bump (backup is at v1), editor chip input, filter UI.' },
      { id: 'rm-trail', title: 'Scrollable + clickable ride trail', status: 'open', badge: 'BROWSE', note: 'Turn the truncated trail into a horizontal strip; each stop opens its leg.' },
      { id: 'rm-gallery', title: 'Photo gallery tab', status: 'open', badge: 'BROWSE', note: 'Global all-photos view (already flatten per-ride for the overlay). Best "show my friends" screen.' },
      { id: 'rm-borders', title: 'State boundaries + realistic grid', status: 'open', badge: 'GEO', note: 'Bundle simplified state GeoJSON (~150–300KB), true lat/lng graticule, keep the hand-drawn look.' },
      { id: 'rm-country-map', title: 'Country map of all trips on home', status: 'open', badge: 'GEO', note: 'The hero and riskiest — depends on boundary data + a fixed projection. Build last.' },
      { id: 'rm-countries', title: 'Other countries in setup', status: 'open', badge: 'SETUP', note: 'Unlock the hardcoded dropdown, add km↔mi conversion, anchor the geo features.' },
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
