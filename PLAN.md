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

### Table: `rides`
*   `id?: number` (Auto-incremented primary key)
*   `title: string` (Defaults to ride start date)
*   `createdAt: string` (ISO timestamp)

### Table: `legs`
*   `id?: number` (Auto-incremented primary key)
*   `rideId: number` (Foreign key to `rides.id`)
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
export function computeTotalDistance(legs: Leg[]): number {
  const sorted = [...legs].sort((a, b) => a.date.localeCompare(b.date));
  let total = 0;
  let lastOdo: number | null = null;

  for (const leg of sorted) {
    if (leg.km != null) {
      total += leg.km;
      if (leg.odo != null) lastOdo = leg.odo;
    } else if (leg.odo != null) {
      if (lastOdo != null && leg.odo > lastOdo) {
        total += (leg.odo - lastOdo);
      }
      lastOdo = leg.odo;
    }
  }
  return total;
}
```

### C. OSRM Snapping & Detour Check (`src/road.ts`)
*   **Request URL:** `GET https://router.project-osrm.org/route/v1/driving/{A.lng},{A.lat};{B.lng},{B.lat}?overview=full&geometries=geojson`
*   **Detour Safety Filter:** Before saving the snapping route, calculate the straight-line Haversine distance between Pin A and Pin B. If OSRM's route geometry distance exceeds `5x` the Haversine distance, ignore the snapped route and fall back to the straight line to protect against highway detours.
*   **Retroactive Backfill:** A background job runs at launch to query OSRM for legs captured offline (missing `roadPath`), with a 200ms delay between segments.

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
  │         ├── home.tsx      # Ride list grid, global gear settings
  │         ├── ride-detail.tsx  # Day log journal and ride squiggle view
  │         ├── leg-detail.tsx   # Photo view, notes text, segment squiggle map
  │         ├── editor/       # Consolidated creation/editing form
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
- [x] Establish `src/types.ts` defining Ride, Leg, and discriminated location states.
- [x] Set up `src/db.ts` containing the Dexie database schema for `rides` and `legs`.
- [x] Build `src/images.ts` Canvas-based photo compressor (JPEG, 80% quality, max 1600px edge length).
- [x] Implement `src/lib.ts` odometer distance aggregator logic with chronologically sorted traversal.
- [x] Write integration test checks for DB read/writes and image compression constraints.

### **Phase 3: Design Tokens & Base UI**
- [x] Define light/dark variables in `src/styles.css` (Cream Paper & Dark Ink/Brown, typography scales, monospace overrides).
- [x] Implement reactive theme manager (local storage caching + system preference hook).
- [x] Build `src/ui/setup.tsx` screen for first-run configuration and Storage Manager persistent registration request.
- [x] Create the core dashboard layout `src/ui/home.tsx` displaying the ride list and settings menu (with theme toggle).
- [x] Implement the routing controller inside `src/App.tsx` responding to `#/...` hash paths.

### **Phase 4: Editors & Backup/Restore**
- [x] Construct the unified form component `src/ui/editor/index.tsx` supporting `new-ride`, `edit-ride`, `new-leg`, and `edit` states.
- [x] Wire multi-file image upload inside the editor to process files through the canvas compressor.
- [x] Build JSON exporter inside `src/ui/backup.tsx` (packaging ride indexes and base64 encoded photo blobs).
- [x] Build JSON importer inside `src/ui/backup.tsx` (clearing existing records, restoring indexes, and reloading states).

### **Phase 5: Map Squiggle & OSRM Engine**
- [x] Write the coordinate-to-viewBox projection utility in `src/ui/squiggle.tsx`.
- [x] Connect `src/road.ts` to coordinate routing snapshots from the OSRM public service.
- [x] Code the Haversine distance calculator and detour safety filter in `src/road.ts` to reject anomalous Snaps.
- [x] Add wobbly textures to map SVG polylines in `src/ui/squiggle.tsx` using custom SVG turbulence displacement filters.
- [x] Build background OSRM backfiller task processing offline pins on launch.

### **Phase 6: Integration & Verification**
- [x] Connect ride timeline page `src/ui/ride-detail.tsx` displaying chronological day cards and cumulative routes.
- [x] Assemble single-leg screen `src/ui/leg-detail.tsx` showing notes, full photo carousels, and highlighted segment maps.
- [x] Perform offline simulation runs to check route fallbacks (named waypoints, straight lines, deferred snaps).
- [x] Run typescript compiler check (`npm run build`) and refine micro-animations.

---

## 7. Google Drive Cloud Backup Integration

### 7.1 Goal

Add optional Google Drive backup/restore so users don't lose data when their phone wipes browser storage. The existing local JSON export/import stays unchanged — GDrive is an additional transport.

### 7.2 Architecture

```
┌──────────────────────────────────────────────────────┐
│  Backup Page (src/ui/backup.tsx)                     │
│                                                      │
│  ┌──────────────────┐  ┌───────────────────────────┐ │
│  │ Local Backup     │  │ Google Drive Backup       │ │
│  │ [Export File]    │  │ [Connect Account]         │ │
│  │ [Import File]    │  │ [Backup Now] [Restore]    │ │
│  │                  │  │ [Auto-sync toggle]        │ │
│  │                  │  │ Last backup: Jun 15       │ │
│  └──────────────────┘  └───────────────────────────┘ │
└──────────────┬──────────────────────┬────────────────┘
               │                      │
               ▼                      ▼
        ┌──────────┐          ┌──────────────┐
        │ Download │          │ gdrive.ts    │
        │ JSON file│          │ - auth       │
        └──────────┘          │ - upload     │
                              │ - download   │
                              │ - list       │
                              └──────┬───────┘
                                     │
                        ┌────────────▼────────────┐
                        │ backup-compress.ts      │
                        │ gzip via CompressionStream│
                        └────────────┬────────────┘
                                     │
                        ┌────────────▼────────────┐
                        │ Google Drive API v3     │
                        │ POST /upload/drive/v3   │
                        └─────────────────────────┘
```

### 7.3 Backup Format

Same JSON structure as current v2 (`BackupPayload`), compressed with gzip before upload.

- **Format version**: `version: 2` in the JSON payload (schema with `rides` and `legs` arrays)
- **Transport**: gzipped before upload, decompressed after download
- **Detection**: Check for gzip magic bytes (`0x1f 0x8b`) on import to auto-detect compression
- **File naming**: `retread-backup-YYYY-MM-DD.json.gz`
- **App metadata**: Each uploaded file gets `appProperties: { isRetreadBackup: "true" }` so the app can find only its own files

**Size estimates** (200 photos, 10 rides):

| Format | Size |
|--------|------|
| Current JSON (no compression) | ~39.5 MB |
| JSON + gzip | ~33 MB |

### 7.4 OAuth2 Flow (Google Identity Services)

**Library**: `https://accounts.google.com/gsi/client` (loaded async in `index.html`)

**Flow**: Implicit grant via `google.accounts.oauth2.initTokenClient`

```
1. User clicks "Connect Google Account"
2. GIS opens popup → Google sign-in → consent screen
3. Token returned to callback → stored in memory (not localStorage)
4. Subsequent API calls use the access token
5. Token expiry → re-authenticate silently
```

**Scope**: `https://www.googleapis.com/auth/drive.file`
- App can ONLY access files it creates
- Cannot see the user's existing Drive contents
- Requires Google Cloud Console project with Drive API enabled

**Client ID**: Stored in `VITE_GDRIVE_CLIENT_ID` environment variable, referenced in `src/constants.ts`.

### 7.5 New Files

| File | Purpose | Size |
|------|---------|------|
| `src/gdrive.ts` | OAuth token management, upload, download, list, delete | ~150 lines |
| `src/backup-compress.ts` | gzip compress/decompress via CompressionStream | ~30 lines |

### 7.6 Modified Files

| File | Changes |
|------|---------|
| `src/ui/backup.tsx` | Add GDrive section: connect button, backup/restore buttons, auto-sync toggle, progress indicator |
| `src/constants.ts` | Add `GDRIVE_CLIENT_ID`, `GDRIVE_SCOPES`, `GDRIVE_APP_METADATA_KEY` |
| `index.html` | Add `<script src="https://accounts.google.com/gsi/client" async defer></script>` |
| `src/styles.css` | Styles for GDrive section, connection status, auto-sync toggle |
| `.env.example` | Add `VITE_GDRIVE_CLIENT_ID=` |
| `vite.config.ts` | Expose `VITE_GDRIVE_CLIENT_ID` via `import.meta.env` |

### 7.7 Module Details

#### `src/backup-compress.ts`

```typescript
// Compress a string to gzipped Blob using native CompressionStream
export async function gzipString(str: string): Promise<Blob>

// Decompress gzipped Blob back to string using native DecompressionStream
export async function gunzipBlob(blob: Blob): Promise<string>
```

- Uses `CompressionStream('gzip')` and `DecompressionStream('gzip')`
- Zero dependencies — native browser API (Baseline since May 2023)
- Supported: Chrome 80+, Safari 15.4+, Firefox 113+

#### `src/gdrive.ts`

Key exports:

```typescript
// Load the GIS script dynamically
export async function loadGIScript(): Promise<void>

// Request access token via popup
export function requestAccessToken(): Promise<string>

// Get cached token or request new one
export async function getAccessToken(): Promise<string>

// Upload compressed backup to Drive
export async function uploadBackup(
  compressedBlob: Blob,
  filename: string,
  accessToken: string
): Promise<{ fileId: string; name: string }>

// List all Retread backups (by app metadata)
export async function listBackups(
  accessToken: string
): Promise<Array<{ id: string; name: string; size: number; modifiedTime: string }>>

// Download and return raw gzipped blob
export async function downloadBackup(
  fileId: string,
  accessToken: string
): Promise<Blob>

// Delete a backup file
export async function deleteBackup(
  fileId: string,
  accessToken: string
): Promise<void>
```

**API endpoints used**:
- `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart` — upload
- `GET https://www.googleapis.com/drive/v3/files?q=appProperties has { key='isRetreadBackup' and value='true' }&fields=files(id,name,size,modifiedTime)` — list
- `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` — download
- `DELETE https://www.googleapis.com/drive/v3/files/{fileId}` — delete

**Token handling**: Stored in module-level variable (memory only). Not persisted to localStorage. User re-authenticates per session. This is the secure approach for implicit flow.

### 7.8 Auto-Sync Feature

**Toggle**: "Auto-sync to Google Drive" checkbox in the GDrive backup section.

**Behavior**:
- When enabled, the app automatically uploads a compressed backup to Google Drive after every successful save (new ride, new leg, edit, delete)
- Uses a **debounce** of 5 seconds — if multiple saves happen in quick succession, only one upload is triggered
- Stores the last sync timestamp in `localStorage` key `retread-gdrive-last-sync`
- Shows a subtle sync indicator (spinning icon → checkmark) in the header or settings panel

**Implementation**:
```typescript
// src/gdrive.ts
let autoSyncEnabled = boolean; // loaded from localStorage
let pendingSyncTimeout: number | null = null;

// Called after every successful save in save-helper.ts
export function scheduleAutoSync(): void {
  if (!autoSyncEnabled || !getAccessToken()) return;
  if (pendingSyncTimeout) clearTimeout(pendingSyncTimeout);
  pendingSyncTimeout = window.setTimeout(async () => {
    await performAutoSync();
  }, 5000); // 5 second debounce
}

// The actual sync
async function performAutoSync(): Promise<void> {
  // 1. Read all data from IndexedDB
  // 2. Serialize to JSON
  // 3. Compress with gzip
  // 4. Find existing backup on Drive (by filename or metadata)
  // 5. Update existing file, or create new one
  // 6. Update last-sync timestamp
  // 7. Show subtle success indicator
}
```

**Edge cases**:
- No access token → skip silently (user hasn't connected yet)
- Network offline → skip silently, will sync on next save when online
- Upload fails → log to console, don't show error toast (auto-sync is best-effort)
- User disables auto-sync → clear pending timeout, stop scheduling

**Storage on Drive**:
- Only one backup file per device/app instance (overwrite on each sync)
- File named: `retread-autosync.json.gz`
- distinguished from manual backups by name pattern

### 7.9 UI Design

#### Backup Page Layout

```
┌─────────────────────────────────────────────┐
│ ← Backup & Restore                          │
├─────────────────────────────────────────────┤
│                                             │
│  Retread stores all data locally. Use       │
│  these tools to back up regularly.          │
│                                             │
│  ── Local Backup ───────────────────────    │
│                                             │
│  Downloads all rides, logs, and photos      │
│  as a single JSON file.                     │
│                                             │
│  [Export Backup File]  [Select Backup File] │
│                                             │
│  ── Google Drive ───────────────────────    │
│                                             │
│  ☁ Back up to your Google Drive.            │
│  Files are encrypted in transit and at rest.│
│  Only you can access them.                  │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ [Connect Google Account]            │    │
│  │ (or) Connected as user@gmail.com    │    │
│  │ [Disconnect]                        │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Last backup: Jun 15, 2026 at 3:42 PM      │
│  [Backup Now]  [Restore from Drive]         │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ☐ Auto-sync after each save         │    │
│  │   Backs up automatically when you   │    │
│  │   add or edit rides.                │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ── Existing Backups ───────────────────    │
│  ┌─────────────────────────────────────┐    │
│  │ retread-backup-2026-06-15.json.gz   │    │
│  │ 33 MB · Jun 15, 2026  [Delete]      │    │
│  │                                     │    │
│  │ retread-autosync.json.gz            │    │
│  │ 33 MB · Jun 15, 2026  [Delete]      │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

#### Progress States

| State | Display |
|-------|---------|
| Disconnected | "Connect Google Account" button |
| Connecting | "Connecting..." spinner |
| Connected | "Connected as user@gmail.com" + disconnect |
| Backing up | "Compressing..." → "Uploading (45%)..." → "Done!" |
| Restoring | "Downloading..." → "Decompressing..." → "Restoring database..." |
| Sync indicator | Small icon in header: ⟳ syncing, ✓ synced, (hidden when idle) |

### 7.10 Backward Compatibility

| Scenario | Handling |
|----------|----------|
| Import v2 JSON (uncompressed) | Auto-detect: parse as JSON directly |
| Import v2+gzip (compressed) | Auto-detect: check gzip magic bytes, decompress first |
| GDrive restore always compressed | Downloads are always gzipped |
| Existing local export unchanged | Still generates uncompressed JSON file |
| New GDrive backups always compressed | All uploads use gzip |

### 7.11 Error Handling

| Error | Response |
|-------|----------|
| GIS script fails to load | Show "Unable to connect to Google. Check your connection." |
| OAuth popup blocked | Show toast: "Popup blocked. Please allow popups for this site." |
| Token expired | Re-authenticate silently via `initTokenClient` with `prompt: ''` |
| Network offline | Show "Offline" state on GDrive buttons. Auto-sync skips silently. |
| Upload fails | Show toast: "Backup failed. Will retry on next attempt." |
| Download fails | Show toast: "Restore failed. Please try again." |
| Drive quota exceeded | Show toast: "Google Drive quota exceeded. Delete old backups." |
| No backups found on Drive | Show "No backups found on Google Drive." |

### 7.12 Google Cloud Console Setup (User Responsibility)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project (or select existing)
3. Enable **Google Drive API** from API Library
4. Go to **Credentials** → Create Credentials → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: "Retread"
   - Authorized JavaScript origins: `http://localhost:5173`, `https://your-deployed-domain.com`
5. Copy the Client ID
6. Create `.env` file: `VITE_GDRIVE_CLIENT_ID=xxxxx.apps.googleusercontent.com`
7. No client secret needed (implicit flow is client-side only)

### 7.13 Dependencies

| Dependency | Type | Size | Purpose |
|------------|------|------|---------|
| `cbor-x` | ~~Runtime~~ | ~~3KB~~ | ~~Not needed (chose JSON + gzip)~~ |
| CompressionStream | Native API | 0 | gzip compress/decompress |
| Google Identity Services | External script | ~50KB | OAuth2 popup flow |
| Google Drive API v3 | REST API | 0 | Upload/download/list/delete |

**Net new runtime dependencies: 0**

### 7.14 Implementation Order

| Step | File | Description |
|------|------|-------------|
| 1 | `src/backup-compress.ts` | Create gzip helpers (CompressionStream) |
| 2 | `src/constants.ts` | Add GDrive constants (client ID, scope, metadata key) |
| 3 | `.env.example` | Add `VITE_GDRIVE_CLIENT_ID` |
| 4 | `src/gdrive.ts` | Create GDrive service (auth, upload, download, list, delete) |
| 5 | `index.html` | Add GIS script tag |
| 6 | `src/ui/backup.tsx` | Add GDrive UI section (connect, backup, restore, auto-sync) |
| 7 | `src/styles.css` | Style GDrive section |
| 8 | `src/ui/editor/save-helper.ts` | Hook `scheduleAutoSync()` after successful saves |
| 9 | `src/gdrive.ts` | Implement auto-sync logic (debounce, overwrite) |
| 10 | Test | Verify OAuth flow, upload, download, restore, auto-sync |

### 7.15 Security Considerations

- **Scope limited to `drive.file`** — app can only access files it creates
- **No client secret** — implicit flow, token exposed to browser (normal for SPA)
- **Token in memory only** — not persisted to localStorage/cookies
- **No user Drive contents accessed** — app metadata filter ensures only own files
- **HTTPS required** — Google OAuth requires HTTPS in production
- **CORS** — Google Drive API supports CORS for browser apps
