<p align="center">
  <img src="public/readme-hero.svg" alt="Retread — A journal for well-tread journeys" width="100%" />
</p>

<p align="center">
  <strong>A journal for well-tread journeys.</strong><br/>
  <em>Private. Offline. Yours.</em>
</p>

<p align="center">
  <a href="https://aanndch.github.io/retread/">Live Demo</a> ·
  <a href="#features">Features</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a>
</p>

---

## What is Retread?

Retread is a Progressive Web App for journaling motorcycle trips. You log daily entries with notes, photos, odometer readings, and GPS pins — Retread stitches them into ride timelines with hand-drawn route maps.

Everything stays on your device. No accounts. No cloud. No tracking. Just your rides, stored in your browser's IndexedDB.

### Why build this?

Most trip trackers want your data on their servers, require accounts, or run background GPS that drains your battery on remote rides. Retread takes a different approach:

- **Local-first** — Your data never leaves your device
- **Offline-capable** — Works without signal, which matters on mountain passes
- **No background processes** — You log when you want, not when an app decides to track you
- **Portable backups** — Export everything as a single JSON file you own

---

## Features

### 🗒️ Trip Logging
Create multi-day ride journals. Each trip contains daily "page" entries with freeform notes, photos, distance/odometer tracking, and location pins.

### 🗺️ Route Visualization
GPS waypoints are snapped to actual roads via the [OSRM](http://project-osrm.org/) routing engine and rendered as hand-drawn SVG squiggle maps — no heavy map libraries needed.

- **Douglas-Peucker simplification** keeps paths under 200 points for smooth rendering
- **SVG turbulence filters** give routes an organic, pen-on-paper look
- **Detour safety guards** prevent unreasonable OSRM routes from distorting the map

### 📸 Photo Journal
Attach multiple photos per day. Images are compressed client-side (max 1600px edge, 80% JPEG quality) before storage, keeping the database lean while preserving visual clarity.

### 🔒 Privacy by Design
Zero network requests for data storage. No analytics. No telemetry. The only external calls are OSRM for optional route snapping and OpenStreetMap for optional map tiles — both cached locally via service worker.

### 🎨 7 Color Themes
Hand-crafted palettes that update the entire UI and the browser chrome:

| Theme | Description |
|-------|-------------|
| Daylight | Cream paper & dark ink |
| Nightfall | Dark ink & warm glow |
| Sepia | Aged parchment |
| Midnight | Deep blue night |
| Slate | Warm concrete gray |
| Monotone | High-contrast grayscale |
| Cyberpunk | Neon noir |

### 💾 Backup & Restore
Full data portability. Export all trips, pages, GPS paths, and photos (Base64-encoded) as a single `.json` file. Import on any device to restore.

### 📱 Installable PWA
Add to home screen for a fullscreen, app-like experience. Includes:
- Service worker with offline caching
- Smart cache strategies (CacheFirst for fonts/tiles, NetworkFirst for routing)
- Platform-specific install prompts (iOS Safari Share button, Chrome install)
- Periodic backup reminders for iOS users (due to Safari's IndexedDB eviction)

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **UI Framework** | [Preact](https://preactjs.com/) | ~3KB gzipped vs React's ~40KB. Same API, fraction of the weight. |
| **Database** | [Dexie.js](https://dexie.org/) (IndexedDB) | Reactive queries, zero server dependency, stores binary photo blobs directly. |
| **Build** | [Vite](https://vitejs.dev/) + TypeScript | Fast HMR in dev, optimized production bundles. |
| **PWA** | [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) + Workbox | Service worker generation, manifest, runtime caching strategies. |
| **Maps** | Custom tile renderer | No Leaflet/Mapbox dependency. Direct OpenStreetMap tile fetching with SVG route overlay. Saves ~40KB+ gzipped. |
| **Routing** | [OSRM](http://project-osrm.org/) | Free, open-source road snapping. No API keys needed. |
| **Typography** | Space Mono, Courier Prime, JetBrains Mono | Typewriter aesthetic for journal text, mechanical font for metrics. |
| **Styling** | Vanilla CSS with custom properties | 7 themes via CSS custom property swaps. No utility framework overhead. |

### Architecture Decisions

- **No map library** — Maps are rendered by fetching OpenStreetMap PNG tiles directly and compositing SVG route overlays. This eliminates the largest typical dependency while still supporting pan, pinch-to-zoom, and interactive location picking.

- **Client-side image pipeline** — Photos are resized on a `<canvas>` element and exported as compressed JPEGs before ever touching IndexedDB. This keeps the database small without requiring a server-side image service.

- **SVG route rendering with turbulence filters** — Routes are drawn as cubic Bézier curves through an SVG `feTurbulence` + `feDisplacementMap` filter chain, producing a hand-drawn, pen-on-paper aesthetic that matches the typewriter design language.

- **Retroactive route backfilling** — When a new leg is saved, all trip routes are recalculated in the background using the updated GPS waypoint sequence. This means you can add legs out of order and the route still stitches together correctly.

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm

### Development

```bash
git clone https://github.com/aanndch/retread.git
cd retread
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview
```

### Type Checking

```bash
npx tsc --noEmit
```

---

## Deployment

Retread deploys to **GitHub Pages** automatically on every push to `master` via a [GitHub Actions workflow](.github/workflows/deploy.yml).

The pipeline:
1. Checks out the code
2. Installs dependencies (`npm ci`)
3. Builds the production bundle (`npm run build`)
4. Deploys the `dist/` directory to GitHub Pages

---

## Project Structure

```
src/
├── App.tsx                  # Shell, routing, prompt orchestration
├── main.tsx                 # Entry point, SW registration, theme init
├── db.ts                    # Dexie database schema
├── types.ts                 # TypeScript interfaces (Trip, Page, Location)
├── constants.ts             # Route hashes, OSRM config, image limits
├── theme.ts                 # 7-theme engine with system preference detection
├── road.ts                  # OSRM route snapping + detour safety filter
├── lib.ts                   # Distance computation, date formatting
├── images.ts                # Client-side photo compression pipeline
├── styles.css               # Complete design system (tokens, components, themes)
│
├── ui/
│   ├── home.tsx             # Trip grid, settings panel, skeleton loader
│   ├── setup.tsx            # First-run onboarding wizard
│   ├── trip-detail.tsx      # Trip timeline with route map + leg cards
│   ├── page-detail.tsx      # Daily log detail (photos, map, notes)
│   ├── backup.tsx           # Export/import JSON backup
│   ├── squiggle.tsx         # Hand-drawn SVG route map renderer
│   └── editor/              # 3-step trip/leg editor wizard
│
└── components/
    ├── button.tsx            # Polymorphic button (primary/secondary/fab/icon)
    ├── confirm-modal.tsx     # Destructive action confirmation dialog
    ├── info-modal.tsx        # Informational single-action modal
    ├── app-prompts.tsx       # PWA install + iOS backup reminder system
    ├── map-modal.tsx         # Fullscreen pan/zoom map viewer
    ├── map-picker.tsx        # Interactive GPS coordinate picker
    ├── photo-overlay.tsx     # Fullscreen photo viewer with swipe + pinch
    ├── dropdown.tsx          # Custom select dropdown
    ├── page-header.tsx       # Back-button page header
    ├── toast.tsx             # Toast notification system
    └── icons.tsx             # SVG icon components
```

---

## License

This project is not currently licensed for redistribution. All rights reserved.
