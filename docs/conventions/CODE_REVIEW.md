# Code Review: Retread

## Overview

Retread is a local-first PWA for logging motorbike rides. Preact + Vite + Dexie (IndexedDB) + hash routing. Single global CSS file. Offline-capable with Google Drive backup. The codebase is well-structured for its size, with thoughtful attention to mobile UX and browser quirks. This review focuses on bugs, architectural concerns, and design/patterns that could cause problems as the app grows.

---

## Bugs

### 1. `coverUrlCache` grows unbounded — memory leak

**File:** `src/ui/use-ride-book.ts:24`

The `coverUrlCache` Map is never evicted. Every ride's cover and every search thumbnail creates/reads from it via `blobFingerprint()` (SHA-256 of blob bytes). The `useLiveQuery` re-emits on every IndexedDB write, regenerating fresh Blob references that produce new cache entries even for identical content. The cache has no size limit and no TTL — over weeks of use, it silently balloons.

**Fix:** Add LRU eviction (e.g. cap at 50 entries) or expire entries by last-access time. Clear it when rides are deleted.

### 2. Object URL leak across `useEffect` re-runs in `LegDetail`

**File:** `src/ui/leg-detail.tsx:162-168`

```ts
useEffect(() => {
  const blobs = leg?.photos || [];
  const urls = blobs.map((blob) => URL.createObjectURL(blob));
  setPhotoUrls(urls);
  photoUrlsRef.current = urls;
  return () => urls.forEach((url) => URL.revokeObjectURL(url));
}, [leg]);
```

The cleanup function revokes URLs from the current render, which is correct. However, `leg` is an object reference from Dexie's live query — it changes identity on every DB write even if photos haven't changed. This causes unnecessary URL churn. The comparison should diff by photo content, not object identity.

### 3. `requestAccessToken` promise never resolves on success

**File:** `src/gdrive.ts:110`

The function does `window.location.assign(...)` which unloads the page. The `_resolve` parameter is prefixed with underscore — the promise is intentionally never resolved. But callers of `requestAccessToken()` may await it and hang forever if navigation is somehow blocked without throwing. The error path returns `reject`, but the success path has no feedback to the caller.

### 4. Triple `popstate` listener on photo overlay close

**File:** `src/components/photo-overlay.tsx:42-48`, `src/ui/ride-detail.tsx:155-163`, `src/ui/leg-detail.tsx:122-129`

PhotoOverlay registers its own `popstate` listener that calls `onClose()`. RideDetail and LegDetail also register a `popstate` listener that sets `showPhotoModal(false)`. When the user presses Android back with the photo overlay open, all three fire. Currently benign because `setShowPhotoModal(false)` is idempotent, but fragile — any future modal state logic could break.

**Recommendation:** Only PhotoOverlay should handle its own popstate. The host components should not also listen; or the overlay should fire an `onClose` callback that the host's single popstate handler uses.

### 5. `save-helper.ts` error message contradicts behavior

**File:** `src/ui/editor/save-helper.ts:130`

```ts
catch (snapErr) {
  console.warn('Snapping routes failed during edit save:', snapErr);
  throw new Error(`Snapping failed: ${(snapErr as Error).message || snapErr}. Used straight-line fallback.`);
}
```

The message says "Used straight-line fallback" but the function **throws** — the leg is saved via `db.legs.update(legId, legData)` on line 125, but the route backfill failure is treated as a hard error. The user gets a toast saying snapping failed, which is confusing since their data *was* saved. Either the `backfillRideRoutes` failure should be non-fatal (like the `edit-ride` path) or the message should not claim a fallback was used.

### 6. `handleDelete` in ride-detail fires navigation before delete is awaited

**File:** `src/ui/ride-detail.tsx:229-240`

```ts
const handleDeleteRide = async () => {
  try {
    await db.transaction("rw", db.rides, db.legs, async () => {
      await db.legs.where("rideId").equals(rideId).delete();
      await db.rides.delete(rideId);
    });
    onNavigate("#/");
  } catch (err) {
    ...
  }
};
```

This is actually fine — `await` is used. But the `ConfirmModal`'s `handleClose(onConfirm)` fires `setTimeout(action, 250)` which disconnects the async operation from the component lifecycle. If the component unmounts during those 250ms (e.g., user navigates away with Android back while the confirm modal is open), `handleDeleteRide` will try to update state on an unmounted component (via `onNavigate("#/")`). This is unlikely to cause issues in practice but is technically a state-update-after-unmount.

### 7. Toast ID collision possible under rapid calls

**File:** `src/components/toast.tsx:46`

```ts
const showToast = (message: string, ...) => {
  const id = Date.now() + (toastId++);
```

`Date.now()` is millisecond-precise. If two toasts are triggered in the same ms (e.g., from a `Promise.all`), the `toastId` counter prevents collision. But if `toastId` ever overflows or the pattern is copied elsewhere, the `Date.now()` prefix doesn't help uniqueness — `toastId` alone would be fine.

---

## Architecture & Design

### 8. Single 3317-line CSS file — hard to maintain

**File:** `src/styles.css`

All styles for every component, theme, modal, animation, and responsive layout live in one file. At 3317 lines with no CSS modules, no scoping, and no lint rules, it's difficult to:
- Know whether a class is still in use
- Refactor without breaking distant components
- Avoid specificity wars

**Recommendation:** Adopt CSS modules (Vite supports them natively) or at minimum split by component into imported partials. CSS custom properties are already used well — the variable system is strong enough to support scoping.

### 9. No error boundary

If any component throws during render, the entire app whitescreens. There's no `componentDidCatch` equivalent wrapping the router or viewport. For a PWA that stores all data locally, a data-corruption bug in one ride's Dexie record could crash the whole app.

**Recommendation:** Add a simple error boundary around `<main.viewport>` that renders a fallback and offers "Reset to Home" recovery.

### 10. Editor prop drilling — 40+ props on `MetricsStep`

**File:** `src/ui/editor/metrics-step.tsx:6-41`

`MetricsStepProps` has 40 individual props. Every state field and setter is threaded through the parent `Editor` into this child. This makes the component hard to read, hard to refactor, and couples `Editor`'s internal state shape to every sub-step.

**Recommendation:** Pass the `dispatch` function (or a subset of it) directly to child components, or use a context. Preact Context is lightweight and would clean this up significantly.

### 11. Route matching is duplicated

**File:** `src/App.tsx:127-131` (`isGatedRoute`) and `src/App.tsx:266-304` (`renderRoute`)

Both functions match hash patterns against the same routes. `isGatedRoute` decides whether to do a content-gated transition; `renderRoute` decides what to render. If a new route is added, it must be registered in both places. This has already caused a drift: `#/todo` and `#/backup` are ungated, which is intentional, but the `#/test` route is missing from `isGatedRoute` (DEV only, so low risk).

**Recommendation:** Unify route configuration into a single list/dictionary that drives both gating and rendering.

### 12. Multiple `style` objects recreated on every render

**Files:** `src/components/map-picker.tsx`, `src/components/confirm-modal.tsx`, `src/ui/editor/metrics-step.tsx`

Inline `style={{...}}` objects are recreated on every render, causing VDOM diff noise. For static inline styles this is benign in Preact, but in components that also have heavy state (map-picker re-rendering on every map interaction), it adds overhead.

**Recommendation:** Lift static inline styles to CSS classes or `useMemo`.

---

## Patterns Worth Improving

### 13. `useReducer` accepts arbitrary partial state

**File:** `src/ui/editor/index.tsx:75-78`

```ts
const formReducer = (state: EditorState, action: Partial<EditorState>) => {
  const filtered = Object.fromEntries(Object.entries(action).filter(([, v]) => v !== undefined));
  return { ...state, ...filtered };
};
```

The reducer acts like `this.setState` — any partial object is merged. This is error-prone: a typo in `dispatch({ rideTitel: 'x' })` silently sets a nonexistent key on the state, never caught by TypeScript. A discriminated union of action types would catch this at compile time.

### 14. Ref-based mutable state for photos in Editor

**File:** `src/ui/editor/index.tsx:141-146`

```ts
const photosRef = useRef<Blob[]>([]);
photosRef.current = photos;
```

Photos are stored both in `useReducer` state and copied to refs on every render. The refs exist so `handlePhotoChange` can read the latest photos without depending on state closures. This is a valid pattern but adds complexity. An alternative: use `useCallback` with the state updater callback form (`setState(prev => [...prev, ...])`).

### 15. `handleAutoFillDistance` sees stale `fallbackCenter`/`location`

**File:** `src/ui/editor/index.tsx:354-385`

`handleAutoFillDistance` is wrapped in `useCallback` with a dependency on `[location]`. When it fires from the `useEffect` on line 388-392, the closure captures the latest `location`. But the auto-fill effect itself depends on `[distanceMode, location, fallbackCenter, km, gpsLoading]` — if any of these change mid-fetch, a second fetch could overlap with the first. The `gpsLoading` guard helps, but a proper abort controller or "latest request wins" pattern would be safer.

### 16. Hardcoded default map center

**File:** `src/components/map-picker.tsx:73`

```ts
let initialCenter: [number, number] = [31.1048, 77.1734];
```

This is Himachal Pradesh, India. It's jarring for users anywhere else in the world. The map picker should either geolocate the user on open (with permission), use a previously known location, or default to a more neutral center (e.g., [0, 0] with low zoom is arguably less surprising than centering on a specific country).

### 17. No storage quota awareness

Photos are stored as Blobs in IndexedDB. On mobile (especially iOS Safari), IndexedDB storage can be capped or evicted by the OS. There's no `navigator.storage.estimate()` check before upload, no warning when approaching quota, and no eviction strategy. This is a data-loss risk for photo-heavy ride logs.

### 18. Google Drive token refresh not implemented

**File:** `src/gdrive.ts`

OAuth2 implicit-grant tokens expire after ~1 hour. The app uses a manual redirect flow (good for PWA) but never refreshes the token. After expiry, auto-sync silently fails (`cachedToken` is null). The user must manually reconnect via the backup page — but they won't know sync stopped until they check.

**Recommendation:** Switch to the authorization-code + PKCE flow, or at minimum surface a "reconnect" prompt when auto-sync fails due to 401.

### 19. `formatDateRange` uses lowercase month abbreviations

**File:** `src/lib.ts:66`

```ts
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
```

These are rendered directly as text. For English, proper-case "Jan", "Feb" etc. would be more conventional. The `monthLabel` function in `home.tsx` uses `toLocaleDateString` which returns proper-case, creating inconsistency across the UI.

### 20. No automated tests in build pipeline

**File:** `src/ui/test-runner.tsx`

The test runner is a manual DEV-only page at `#/test`. There's no `npm test`, no CI, and no pre-commit hooks. The seed-demo script provides a consistent dataset, so integration tests could verify core flows (create ride → add leg → verify squiggle map → delete).

---

## What's Done Well

1. **Hash-based routing with history depth tracking** — Thoughtfully handles Chrome's `popstate`-on-fragment quirk, Android back stack, and modal push/pop without corruption.

2. **Search overlay at App shell level** — Correct architectural decision. The overlay survives navigation and preserves query state because it lives above the routed viewport.

3. **Content-gated transitions** — The `onReady` callback pattern prevents flash-of-loading and handles async data gracefully.

4. **Offline-first with graceful degradation** — OSRM snapping falls back to straight lines; everything works offline.

5. **PWA-friendly OAuth flow** — Full-page redirect instead of popup, with history stack collapse on return. Correctly handled for standalone PWA mode.

6. **CSS custom property system** — 7 themes driven by data attributes with a clean `--color-*` token design. The variable approach is well-executed.

7. **SquiggleMap SVG renderer** — Custom Douglas-Peucker path simplification, day-colored segments, compass, and `feTurbulence` hand-drawn aesthetic. A standout feature.

8. **`prefers-reduced-motion` support** — Respected globally via CSS.

9. **`blobFingerprint` for stable cover URLs** — SHA-256 content hashing prevents cover image flicker across live-query re-emits. Clever.

10. **Dexie backup/restore with id remapping** — Pre-computes all async work before the transaction so Dexie's transaction scope doesn't expire. Correctly remaps old IDs to new auto-increment values.

---

## Prioritized Recommendations

| Priority | Item | Impact |
|----------|------|--------|
| **High** | `coverUrlCache` eviction (Item 1) | Memory leak over time |
| **High** | `save-helper.ts` misreports snap failure (Item 5) | Confusing UX, data is saved but user sees error |
| **High** | Photo overlay triple popstate (Item 4) | Fragile modal behavior |
| **Medium** | Error boundary (Item 9) | App whitescreens on unhandled render error |
| **Medium** | Token refresh / sync failure visibility (Item 18) | Silent data loss from unsynced backups |
| **Medium** | Editor prop drilling (Item 10) | Maintainability, bug surface |
| **Low** | CSS modularization (Item 8) | Long-term maintainability |
| **Low** | Storage quota checks (Item 17) | Data loss on storage-capped devices |
| **Low** | Duplicate route matching (Item 11) | Drift risk when adding routes |
| **Low** | Map default center (Item 16) | Localization polish |
| **Low** | Month name casing (Item 19) | Visual consistency |
| **Low** | Automated tests (Item 20) | Regression safety |
