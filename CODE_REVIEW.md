# Retread — Code Review Findings

Generated from a senior-level review of the full codebase.

---

## Critical

| # | File | Line(s) | Issue | Fix | Status |
|---|------|---------|-------|-----|--------|
| 1 | `src/components/map-modal.tsx` | 11–19 | **Rules of Hooks violation.** `useState`/`useRef` called after early `return null` when `isOpen` is false. Hooks are skipped → Preact throws on toggle. | Move all hooks above the conditional return. | DONE |
| 2 | `src/ui/squiggle.tsx` | 67–74 | **Rules of Hooks violation.** Returns JSX when `path.length < 2` before `useMemo` hooks. Short paths crash the component. | Move all hooks above the early return. Guard memo computations inside hooks. | DONE |
| 3 | `src/ui/editor/index.tsx` | 93–95 | **Rules of Hooks violation.** Returns `<p>Invalid editor mode.</p>` before `useToast()` and `useRef` on lines 97–99. | Move hook calls above the early return. | DONE |
| 4 | `src/components/photo-overlay.tsx` | 18–25 | **Rules of Hooks violation.** Same pattern — early `return null` before hooks. | Move all hooks above the conditional return. | DONE |
| 5 | `src/components/map-picker.tsx` | 23–26 | **Rules of Hooks violation.** Same pattern — early `return null` before hooks. | Move all hooks above the conditional return. | DONE |
| 6 | `index.html` | 5 | **`user-scalable=no` blocks pinch-to-zoom.** Fails WCAG 2.1 SC 1.4.4 (Resize text). Users with low vision cannot zoom. | Remove `user-scalable=no, maximum-scale=1.0`. | DONE |
| 7 | `src/styles.css` | (global) | **No `:focus-visible` anywhere.** All interactive elements (buttons, dropdowns, progress steps) lack keyboard focus indicators. Keyboard-only users can't see where focus is. | Add `:focus-visible { outline: 2px solid var(--color-green); outline-offset: 2px }` for all interactive elements. | DONE |
| 8 | `vite.config.ts` | 36 | **Invalid manifest icon `purpose`.** `purpose: 'any maskable'` is not valid per W3C spec. Browsers ignore the maskable hint entirely. | Split into two separate icon entries — one with `purpose: 'any'`, one with `purpose: 'maskable'`. | DONE |

---

## High

| # | File | Line(s) | Issue | Fix | Status |
|---|------|---------|-------|-----|--------|
| 9 | `src/components/map-modal.tsx` | 67–85 | **Stale closure on touch/mouse drag.** `handleMapTouchMove`/`handleMapMouseMove` read `isDragging` from render closure. After `setIsDragging(true)`, the first `touchmove` fires before re-render → drag silently ignored. | Use a `useRef` for `isDragging` (set ref in start handler, read ref in move handler). | DONE |
| 10 | `src/components/photo-overlay.tsx` | 63–76 | **Stale closure on photo drag.** Same pattern — `handlePhotoTouchMove` reads `isPhotoDragging` from render closure. | Use a ref for `isPhotoDragging`. | DONE |
| 11 | `src/components/map-modal.tsx` | 132–134 | **Mouse drag escapes container.** `onMouseMove`/`onMouseUp` bound to inner div only. User drags outside → `isDragging` stuck true, cursor stuck as grabbing. | Attach `mousemove`/`mouseup` to `document` in `handleMapMouseDown`, clean up in `handleMapMouseUp`. | DONE |
| 12 | `src/components/photo-overlay.tsx` | 138–140 | **Same issue as #11** for photo overlay. | Same fix — document-level listeners for mousemove/mouseup. | DONE |
| 13 | `src/ui/page-detail.tsx` | 283 | **Carousel dots missing `key`.** Preact reuses wrong DOM nodes when photo count changes. | Add `key={i}`. | DONE |
| 14 | `src/components/photo-overlay.tsx` | 157 | **Carousel dots missing `key`.** Same issue. | Add `key={idx}`. | DONE |
| 15 | `tsconfig.app.json` | 3–28 | **TypeScript strict mode disabled.** Missing `strict: true`, `noImplicitAny`, `strictNullChecks`. Undermines TypeScript's value for a Dexie (IndexedDB) codebase where null errors are common. | Add `"strict": true`. Fix resulting type errors. | DONE |
| 16 | `src/styles.css` | (multiple) | **14+ `!important` declarations.** Masking specificity problems instead of solving them. Makes future overrides and maintenance harder. | Refactor to proper specificity chains (e.g., `.editor-form .input-error:focus` instead of `!important`). | DONE |
| 17 | `src/styles.css` | 798, 962, 967, 973, 1298, 1311–1318, 1601 | **Error red `#d9534f` hardcoded 7 times.** Inconsistent with the design token system. Impossible to theme. | Add `--color-error: #d9534f` to `:root` and dark theme overrides. Replace all hardcoded instances. | DONE |
| 18 | `src/styles.css` | (global) | **No `@media (prefers-reduced-motion: reduce)`.** Draw animation (4.5s), slide-up modals, fade-in transitions all play for users with vestibular disorders. | Wrap all animations/transitions in a reduced-motion query that disables or shortens them. | DONE |
| 19 | `index.html` | 6 | **`theme-color` hardcoded to light.** Browser chrome stays light even in dark mode (`#1c1b18`). | Update via JS on `prefers-color-scheme` change. | DONE |
| 20 | `.gitignore` | — | **Missing `.env*` pattern.** `.env.development.local`, `.env.production.local` not covered. Secrets could be committed. | Add `.env*` to `.gitignore`. | DONE |
| 21 | `src/styles.css` | 1706–1715 | **Photo overlay close button hardcoded colors.** `#2b2926`/`#ebdcb9` instead of CSS variables. Breaks if dark theme tokens change. | Use `var(--color-paper)` / `var(--color-ink)`. | DONE |
| 22 | `src/ui/editor/index.tsx` | 320–346 | **Stale closure on photo change.** `handlePhotoChange` reads `photos`/`photoPreviews` from render closure. Rapid file selection overwrites first batch. | Use functional dispatch: `dispatch(s => ({ photos: [...s.photos, ...newBlobs] }))`. | DONE |
| 23 | `src/ui/trip-detail.tsx` | 44–46 | **Stale closure on stableNavigate.** `useCallback(…, [])` closes over `onNavigate` prop. If prop changes, callback uses stale original. | Use a ref: `const navRef = useRef(onNavigate); navRef.current = onNavigate;`. | DONE |
| 24 | `src/ui/editor/index.tsx` | 269–272, 344 | **Object URL leak on unmount.** `prevPreviewsRef` is set before dispatch. Most recently added previews (in state but not in ref) leak on unmount. | Revoke all current `photoPreviews` in unmount cleanup via a ref that's always current. | DONE |

---

## Medium

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| 25 | `src/ui/home.tsx` | 33–88 | **N+1 query in `useLiveQuery`.** Fetches all trips, then queries pages per trip. O(trips × pages) on every DB change. | Pre-compute summaries in a single joined query or cache with `useMemo`. |
| 26 | `src/components/toast.tsx` | 40 | **`toastId` resets on HMR.** Module-level counter resets during Vite hot reload → duplicate keys. | Use `Date.now()` + `Math.random()` or `crypto.randomUUID()`. |
| 27 | `src/ui/editor/index.tsx` | 133–149, 275–291 | **Geolocation callback not cleaned up.** Pending callbacks fire on unmounted component. | Use `AbortController` or track an `active` ref. |
| 28 | `src/components/confirm-modal.tsx` | — | **No focus trap.** Keyboard users can tab behind the modal. No focus restoration on close. | Focus confirm button on mount. Trap Tab within modal. Restore focus on unmount. |
| 29 | `src/ui/home.tsx` | 305–326 | **Settings button is raw `<button>`.** Not using `Button` component. Inconsistent with rest of codebase. | Use `<Button variant="tertiary">`. |
| 30 | `tsconfig.app.json` | 8 | **`allowArbitraryExtensions: true`.** Not needed. Weakens module resolution safety. | Remove unless a dependency requires it. |
| 31 | `vite.config.ts` | 7 | **`base: '/retread/'` not configurable.** Deploying to different path silently breaks asset URLs. | Consider `process.env.BASE_URL` or document the constraint. |
| 32 | `src/ui/page-detail.tsx` | 260–269 | **Touch events don't prevent default.** Swiping through photos can trigger browser back/forward gesture or page scroll. | Add `touch-action: pan-y` CSS to carousel container. |
| 33 | `src/ui/editor/index.tsx` | 69 | **`formReducer` is just a shallow merge.** Dispatching `{ photos: undefined }` sets photos to undefined instead of ignoring. | Use discriminated union action types or filter undefined values. |
| 34 | `src/styles.css` | 962, 966, 967, 1291–1295, 1310–1318, 1654, 1664–1668 | **Pervasive `!important` usage.** (Duplicate of #16 — listed here for CSS-specific tracking.) | Refactor to proper specificity chains. |
| 35 | `vite.config.ts` | 42–55 | **OSRM route cache timeout too short.** `networkTimeoutSeconds: 5` — on slow 3G, legitimate requests fall back to cache prematurely. | Increase to 8–10 seconds. |
| 36 | `src/ui/editor/index.tsx` | 275, 293 | **`handleDropPin`/`handleClearLocation` not memoized.** Recreated every render → child `MetricsStep` re-renders unnecessarily. | Wrap in `useCallback`. |
| 37 | `src/ui/trip-detail.tsx` | 30–42, `page-detail.tsx:39–69` | **History state pollution.** Per-modal `popstate` handlers can double-close modals or cause unexpected state. | Use a single centralized popstate handler per view. |

---

## Low

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| 38 | `src/styles.css` | 229 | `.btn-fab` uses `border-radius: 4px` instead of `var(--border-radius)`. | Use `var(--border-radius)`. |
| 39 | `src/styles.css` | 137 | `.btn` uses `transition: all` — transitions unintended properties like `z-index`, `visibility`. | Specify: `transition: background-color 0.15s, color 0.15s, border-color 0.15s, opacity 0.15s, transform 0.15s, box-shadow 0.15s`. |
| 40 | `src/styles.css` | 1586–1588 | `.toast` transitions lack easing — other transitions use `ease`/`ease-in-out`. | Add consistent easing. |
| 41 | `src/styles.css` | 1590–1592 | `.toast` has `white-space: nowrap` with `text-overflow: ellipsis`. Long messages silently truncated. | Allow wrapping or add tooltip/max-height with scroll. |
| 42 | `index.html` | — | **No `<meta name="description">`.** Bad for PWA sharing and social previews. | Add a meaningful description meta tag. |
| 43 | `.gitignore` | — | **Missing `*.tsbuildinfo`.** Build info files could be committed if path changes. | Add `*.tsbuildinfo`. |
| 44 | `.gitignore` | — | **Missing `coverage/`.** Test coverage output not ignored. | Add `coverage/`. |
| 45 | `package.json` | 4 | **Version `0.0.0`.** Placeholder. Should be set before release. | Set to `0.1.0` or use a versioning strategy. |
| 46 | `package.json` | — | **No `engines` field.** TypeScript 6.x may require a specific Node version. | Add `"engines": { "node": ">=20" }`. |
| 47 | `package.json` | — | **No standalone `typecheck`/`lint` scripts.** Build runs `tsc -b` but no way to run it during dev. | Add `"typecheck": "tsc -b --noEmit"`. |
| 48 | `vite.config.ts` | 13–38 | **PWA manifest missing `id`, `scope`, `screenshots`.** Without `id`, some browsers can't identify the installed PWA. Without `screenshots`, install prompt may not trigger. | Add `id`, `scope`, and `screenshots` array. |
| 49 | `src/ui/test-runner.tsx` | 28, 44, 61, 89 | **`catch (e: any)`.** Uses `any` for caught errors, losing type safety. | Use `catch (e: unknown)` and narrow with `e instanceof Error`. |
| 50 | `src/ui/backup.tsx` | 124 | **Unsafe double cast.** `(e.target as HTMLInputElement).files as FileList` — `.files` is already `FileList | null`. | Remove redundant `as FileList`. |
| 51 | `src/ui/setup.tsx` | 39–43 | **Dropdown no-op.** Country dropdown has `onChange={() => {}}`. Appears interactive but doesn't save. | Disable the dropdown or remove if only one option is supported. |
| 52 | `src/components/icons.tsx` | — | **SVG icons missing `aria-hidden`.** Decorative icons announced as images by screen readers. | Add `aria-hidden="true"` to all SVG elements. |
| 53 | `src/styles.css` | 60–64 | **Universal `* { margin: 0; padding: 0 }`.** Can interfere with form elements across browsers. | Use a modern reset targeting block elements only. |
| 54 | `src/styles.css` | 86–93 | **`.viewport` max-width 480px hardcoded.** No responsive adaptation above 480px. | Add breakpoints or document mobile-only intent. |
| 55 | `src/ui/home.tsx` | 369 | **TripCard uses `<a href>`.** Full page reload if JS fails to load. | Consider `onClick` with `onNavigate` for SPA routing. |
| 56 | `src/ui/home.tsx` | 282 | **No loading skeleton.** Just text "Reading logbooks...". | Add skeleton loading cards. |
| 57 | `src/main.tsx` | 12 | **`registerSW({ immediate: true })`.** Old SW replaced immediately, potentially interrupting in-flight requests. | Consider `immediate: false` and handle `onNeedRefresh` callback. |

---

## Summary

| Severity | Total | Fixed |
|----------|-------|-------|
| Critical | 8 | 8 |
| High | 16 | 16 |
| Medium | 13 | 0 |
| Low | 20 | 0 |
| **Total** | **57** | **24** |
