# Retread — PWA Build Plan

This document details the architecture, file structures, core algorithms, and step-by-step phases to build **Retread**, a minimal, private motorbike trip journal.

---

## 1. Project Vibe & Aesthetic System (CRITICAL)
> [!IMPORTANT]
> **Extreme Minimalism & UX Excellence:** The application must feel incredibly clean, fast, and quiet. There should be no visual noise, excess borders, or decorative clutter. Generous whitespace, elegant typewriter typography, and fluid micro-interactions define the premium, tactile feel.
*   **Concept:** "Field notes, not dashboards." A tactile digital travel log.
*   **Palette:** Dual-mode warm colors (system preferred + manual override):
    *   *Light Mode (Cream Paper):* Background `#f4efe6`, text `#2b2926`, accent `#4a5d4e`.
    *   *Dark Mode (Dark Ink/Brown):* Background `#1c1b18`, text `#ebdcb9`, accent `#6b8270`.
*   **Typography:** Space Mono or Courier Prime (Typewriter monospace) for journal notes and entry text; JetBrains Mono (clean mechanical monospace) for odometer numbers, dates, and labels.
*   **Motion:** Subtle page transitions and soft fades. Nothing flashy.

---

## 2. Technical Stack
*   **Core:** Preact + TypeScript + Vite + `vite-plugin-pwa` (reactive rendering with extremely low CPU/battery footprint).
*   **Local Storage:** Dexie.js (IndexedDB library) + `dexie-react-hooks` (reactive, real-time database queries inside components).
*   **Hosting:** GitHub Pages (HTTPS enabled out-of-the-box, which is required for Geolocation APIs).

---

## 3. Database Schema (`src/db.ts`)
We will create `src/db.ts` utilizing Dexie to declare our local databases:

### Table: `trips`
*   `id?: number` (Auto-incremented primary key)
*   `title: string` (Defaults to trip start date)
*   `createdAt: string` (ISO timestamp)

### Table: `pages`
*   `id?: number` (Auto-incremented primary key)
*   `tripId: number` (Foreign key to `trips.id`)
*   `date: string` (Editable date, backdating supported)
*   `note: string` (Freeform textarea text)
*   `photos: Blob[]` (JPEG compressed, max 1600px edge)
*   `km?: number | null` (Direct daily distance entry)
*   `odo?: number | null` (Odometer readings)
*   `location?: LocationUnion | null`
*   `roadPath?: { lat: number; lng: number }[] | null`

```typescript
type LocationUnion =
  | { kind: "gps"; lat: number; lng: number; name?: string }
  | { kind: "named"; name: string };
```

---

## 4. Key Engineering Modules & Algorithms

### A. Image Compression (`src/images.ts`)
Avoids IndexedDB bloating. High-resolution photos are compressed client-side on upload:
1.  Read file as an image object.
2.  Draw it onto a dynamic `<canvas>`.
3.  Resize so that the longest edge (width or height) is limited to `1600px`.
4.  Export using `.toBlob(blob, 'image/jpeg', 0.8)` (80% JPEG compression).
5.  Saves as binary Blobs in Dexie.

### B. Derived Distance Calculator (`src/lib.ts`)
Odometer and KM inputs are computed chronologically without manual overrides:
```typescript
export function computeTotalDistance(pages: Page[]): number {
  const sorted = [...pages].sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  let lastOdo: number | null = null;

  for (const page of sorted) {
    if (page.km != null) {
      total += page.km;
      if (page.odo != null) lastOdo = page.odo;
    } else if (page.odo != null) {
      if (lastOdo != null && page.odo > lastOdo) {
        total += (page.odo - lastOdo);
      }
      lastOdo = page.odo;
    }
  }
  return total;
}
```

### C. OSRM Snapping & Detour Check (`src/road.ts`)
*   **Request URL:** `GET https://router.project-osrm.org/route/v1/driving/{A.lng},{A.lat};{B.lng},{B.lat}?overview=full&geometries=geojson`
*   **Detour Safety Filter:** Before saving the snapping route, calculate the straight-line Haversine distance between Pin A and Pin B. If OSRM's route geometry distance exceeds `5x` the Haversine distance, ignore the snapped route and fall back to the straight line to protect against highway detours.
*   **Retroactive Backfill:** A background job runs at launch to query OSRM for pages captured offline (missing `roadPath`), with a 200ms delay between segments.

### D. SVG Squiggle Map (`src/squiggle.ts`)
Converts geographical points to local SVG viewbox coordinates:
*   Finds minimum/maximum lat/lng to compute relative viewBox scale.
*   Converts snapped coordinate arrays into SVG `<path>` polylines.
*   Adds wobbly hand-drawn textures to lines using an SVG filter (like `<feTurbulence>`) or small midpoint coordinate offsets.

---

## 5. File Layout Structure
```
retread/
  ├── index.html
  ├── package.json
  ├── tsconfig.json
  ├── vite.config.ts
  ├── public/
  │    └── icons/            # App manifest icons
  ├── src/
  │    ├── types.ts          # Core types and interfaces
  │    ├── db.ts             # Dexie DB setup and helper CRUDs
  │    ├── lib.ts            # Metric computations and day indexing
  │    ├── images.ts         # Canvas compression pipeline
  │    ├── road.ts           # OSRM api and retroactive worker
  │    ├── squiggle.tsx      # SVG spline renderer (Preact component)
  │    ├── App.tsx           # Main application shell and routing
  │    ├── main.tsx          # Client entry point
  │    ├── styles.css        # Core custom variables and tactile layout
  │    └── ui/
  │         ├── setup.tsx     # Country select screen and storage warnings
  │         ├── home.tsx      # Trip list grid, global gear settings
  │         ├── trip.tsx      # Day log journal and trip squiggle view
  │         ├── page.tsx      # Photo view, notes text, segment squiggle map
  │         ├── editor.tsx    # Consolidated creation/editing form
  │         └── backup.tsx    # JSON import/export handler
```

---

## 6. Phase-by-Phase Build Order

### **Phase 1: Project Scaffolding**
- [x] Initialize Preact + TypeScript directory using Vite (`npm create vite@latest ./ --template preact-ts`).
- [x] Install production dependencies: `dexie`, `dexie-react-hooks`.
- [x] Install dev dependencies: `vite-plugin-pwa`, `workbox-window`.
- [x] Configure `vite.config.ts` with PWA manifest details, asset precaching, and caching strategies.
- [x] Set up `index.html` structure with viewport headers and Google Font links (Space Mono, JetBrains Mono, Courier Prime).
- [x] Clean up default template files (delete mock assets, reset `src/main.tsx` and `src/App.tsx`).

### **Phase 2: Database & Utility Core**
- [x] Establish `src/types.ts` defining Trip, Page, and discriminated location states.
- [x] Set up `src/db.ts` containing the Dexie database schema for `trips` and `pages`.
- [x] Build `src/images.ts` Canvas-based photo compressor (JPEG, 80% quality, max 1600px edge length).
- [x] Implement `src/lib.ts` odometer distance aggregator logic with chronologically sorted traversal.
- [x] Write integration test checks for DB read/writes and image compression constraints.

### **Phase 3: Design Tokens & Base UI**
- [x] Define light/dark variables in `src/styles.css` (Cream Paper & Dark Ink/Brown, typography scales, monospace overrides).
- [x] Implement reactive theme manager (local storage caching + system preference hook).
- [x] Build `src/ui/setup.tsx` screen for first-run configuration and Storage Manager persistent registration request.
- [x] Create the core dashboard layout `src/ui/home.tsx` displaying the trip list and settings menu (with theme toggle).
- [x] Implement the routing controller inside `src/App.tsx` responding to `#/...` hash paths.

### **Phase 4: Editors & Backup/Restore**
- [ ] Construct the unified form component `src/ui/editor.tsx` supporting `new-trip`, `new-day`, and `edit` states.
- [ ] Wire multi-file image upload inside the editor to process files through the canvas compressor.
- [ ] Build JSON exporter inside `src/ui/backup.tsx` (packaging trip indexes and base64 encoded photo blobs).
- [ ] Build JSON importer inside `src/ui/backup.tsx` (clearing existing records, restoring indexes, and reloading states).

### **Phase 5: Map Squiggle & OSRM Engine**
- [ ] Write the coordinate-to-viewBox projection utility in `src/squiggle.tsx`.
- [ ] Connect `src/road.ts` to coordinate routing snapshots from the OSRM public service.
- [ ] Code the Haversine distance calculator and detour safety filter in `src/road.ts` to reject anomalous Snaps.
- [ ] Add wobbly textures to map SVG polylines in `src/squiggle.tsx` using custom SVG turbulence displacement filters.
- [ ] Build background OSRM backfiller task processing offline pins on launch.

### **Phase 6: Integration & Verification**
- [ ] Connect trip timeline page `src/ui/trip.tsx` displaying chronological day cards and cumulative routes.
- [ ] Assemble single-day screen `src/ui/page.tsx` showing notes, full photo carousels, and highlighted segment maps.
- [ ] Perform offline simulation runs to check route fallbacks (named waypoints, straight lines, deferred snaps).
- [ ] Run typescript compiler check (`npm run build`) and refine micro-animations.
