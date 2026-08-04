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
}

export interface TodoSection {
  id: string;
  label: string;
  items: TodoItem[];
}

export const TODO_SECTIONS: TodoSection[] = [
  {
    id: 'features',
    label: 'Features',
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
    label: 'Fixed Bugs',
    items: [
      { id: 'restore', title: 'GDrive restore threw "transaction committed too early"', status: 'done', note: 'Pre-compute blobs before the Dexie transaction' },
      { id: 'gps-name', title: 'Location name cleared by GPS detect / map picker', status: 'done' },
      { id: 'dead-back', title: 'Dead Android back press', status: 'done', note: 'history.length now distinguishes back from forward' },
      { id: 'editor-flash', title: 'Editor flashed "invalid mode" on back', status: 'done' },
      { id: 'cover-overlap', title: 'Overlay cover button overlapped the page dots', status: 'done', note: 'Unified bottom bar with a counter' },
      { id: 'cover-refresh', title: 'Ride cover needed a refresh to update', status: 'done', note: 'Content-hashed cache key' },
      { id: 'map-icon', title: 'Emoji map icon on "Pick on Map"', status: 'done', note: 'Replaced with a drawn icon' },
      { id: 'trail-dot', title: 'Trail end dot not filled on short trails', status: 'done' },
    ],
  },
];
