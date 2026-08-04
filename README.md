<p align="center">
  <img src="public/readme-hero.svg" alt="Retread" width="100%" />
</p>

<p align="center">
  <a href="https://aanndch.github.io/retread/">Try it live</a> ·
  <a href="#features">Features</a> ·
  <a href="#how-its-built">How it's built</a> ·
  <a href="#getting-started">Getting Started</a>
</p>

---

Retread is a PWA for journaling motorcycle trips. You log daily entries with notes, photos, odometer readings, and GPS coordinates. It connects them into a timeline and draws route maps by snapping your waypoints to real roads.

There's no server. Everything is stored in IndexedDB on your device — photos included. No accounts, no tracking. You own your data as a compressed JSON file you can export anytime, and cloud backups to Google Drive are entirely optional.

## Why

Most trip loggers want you to create an account, store your data on their servers, or run background GPS that kills your battery when you're 50km from the nearest charger. I wanted something simpler: open it, log today's ride, close it. Works offline, works on the road, works without signal.

## Features

**Ride logging** — Create rides with daily "leg" entries. Each leg has a date, freeform notes, photos, distance or odometer readings, and a location (GPS pin or place name).

**Route maps** — GPS waypoints get snapped to actual roads using [OSRM](http://project-osrm.org/) and drawn as SVG paths with a hand-drawn, pen-on-paper look (using SVG turbulence displacement filters). Routes are simplified with Douglas-Peucker before rendering. The snapped path is stored in the database, so OSRM is only called once per leg — viewing the same ride again reads from IndexedDB.

**Photos** — Attach multiple photos per day. They're compressed client-side on a canvas (1600px max edge, 80% JPEG) before being stored as blobs in IndexedDB.

**Maps without a map library in the bundle** — Squiggle route maps are hand-rolled SVG (no Leaflet/Mapbox). The only map library, Leaflet, is injected lazily from a CDN the first time the location picker opens, keeping the main bundle small.

**7 themes** — Daylight, Nightfall, Sepia, Midnight, Slate, Monotone, Cyberpunk. Each one swaps CSS custom properties and updates the browser's `theme-color` meta tag so the address bar matches.

**Backup & restore** — Export everything (rides, legs, GPS paths, photos as Base64) into a single gzip-compressed, versioned JSON file. Import it on another device to restore, or back up to Google Drive with optional auto-sync after each save. iOS users get a periodic reminder because Safari can silently evict IndexedDB data.

**Installable** — Works as a home screen app with offline caching. Service worker uses CacheFirst for fonts and map tiles, NetworkFirst for OSRM routing.

## How it's built

| | What | Why |
|-|------|-----|
| UI | [Preact](https://preactjs.com/) | ~3KB vs React's ~40KB. Same hooks API. |
| Storage | [Dexie.js](https://dexie.org/) (IndexedDB) | Reactive queries, stores photo blobs directly, no server. |
| Build | [Vite](https://vitejs.dev/) + TypeScript | |
| PWA | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) + Workbox | Service worker generation, runtime caching. |
| Routing | [OSRM](http://project-osrm.org/) | Open-source road snapping. No API keys. |
| Fonts | Space Mono, JetBrains Mono | Typewriter feel for journal text, mechanical font for numbers. |
| CSS | Vanilla with custom properties | Themes are just variable swaps. No Tailwind. |

### Interesting decisions

**Lazy Leaflet picker** — The route maps are custom SVG, but the location picker needs real pan/zoom over map tiles. Instead of bundling Leaflet, it injects Leaflet's script and CSS from a CDN the first time the picker opens (see `ui/editor/utils.ts`). The map library never ships in the initial bundle, and tiles are cached by the service worker for offline use.

**Route backfilling** — When you save a new leg, `backfillRideRoutes` recalculates all routes for the ride by walking through legs chronologically. It checks whether each leg's `roadPath` already matches the current endpoints (within 50m) and only calls OSRM for legs that actually changed. So you can add legs out of order and the route still connects correctly.

**SVG squiggle rendering** — Route paths are drawn as cubic Bézier curves, then run through an `feTurbulence` + `feDisplacementMap` SVG filter chain to look hand-drawn. The path is simplified with Douglas-Peucker to stay under ~200 points for smooth rendering.

**Client-side photo compression** — Photos get drawn onto a `<canvas>`, resized to 1600px max, and exported as 80% quality JPEGs before touching the database. Keeps storage reasonable without a server-side pipeline.

## Getting Started

```bash
git clone https://github.com/aanndch/retread.git
cd retread
npm install
npm run dev
```

Dev server runs at `http://localhost:5173`. Production build: `npm run build && npm run preview`.

## Deployment

Pushes to `master` auto-deploy to GitHub Pages via [GitHub Actions](.github/workflows/deploy.yml).

## Project Structure

```
src/
├── App.tsx                  # Router and app shell
├── main.tsx                 # Entry point, service worker registration
├── db.ts                    # Dexie database schema
├── types.ts                 # Ride, Leg, Location types
├── constants.ts             # Routes, OSRM tuning, image/backup settings
├── road.ts                  # OSRM route snapping and backfilling
├── theme.ts                 # Theme engine (7 themes + system detection)
├── lib.ts                   # Distance math, date formatting
├── images.ts                # Client-side photo compression
├── gdrive.ts                # Google Drive OAuth, backup/restore, auto-sync
├── backup-compress.ts       # gzip compress/decompress (CompressionStream)
├── styles.css               # All styles and theme tokens
│
├── ui/
│   ├── home.tsx             # Ride grid with settings panel
│   ├── setup.tsx            # First-run onboarding
│   ├── ride-detail.tsx      # Ride timeline and route map
│   ├── ride-detail/leg-card.tsx  # Per-leg card in the timeline
│   ├── leg-detail.tsx       # Daily log view (photos, map, notes)
│   ├── backup.tsx           # Local + Google Drive export/import
│   ├── squiggle.tsx         # SVG route renderer
│   ├── demo-routes.ts       # Pre-snapped demo ride routes
│   ├── seed-demo.ts         # Demo ride seeding
│   ├── test-runner.tsx      # Dev-only smoke tests
│   └── editor/              # Multi-step ride/leg editor
│       ├── index.tsx        # Editor shell + reducer
│       ├── metrics-step.tsx # Title, date, distance, location
│       ├── photos-step.tsx  # Photo upload
│       ├── story-step.tsx   # Notes / story
│       ├── save-helper.ts   # Serialization + save routing
│       └── utils.ts         # Coordinate parsing, lazy Leaflet loader
│
└── components/
    ├── info-modal.tsx        # Informational modal
    ├── confirm-modal.tsx     # Confirmation dialog
    ├── app-prompts.tsx       # PWA install + iOS backup reminders
    ├── map-modal.tsx         # Fullscreen route map viewer
    ├── map-picker.tsx        # Leaflet-based GPS coordinate picker
    ├── photo-overlay.tsx     # Photo viewer with swipe + pinch zoom
    ├── button.tsx            # Button component
    ├── dropdown.tsx          # Select dropdown
    ├── toast.tsx             # Toast notifications
    ├── page-header.tsx       # Page header with back button
    └── icons.tsx             # SVG icons
```
