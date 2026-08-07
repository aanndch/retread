# Retread — Navigation & Animation Refactor Plan (Option B: Overlay-as-Route)

Working plan for replacing the hand-rolled history/coordination layer with hash-encoded overlay routes, and building a single consistent motion system. Approved direction: **full refactor** (the current three-history-system architecture is the root cause of a class of glitches; patching individually defers the failure).

Status: **COMPLETE — all phases implemented, verified (R5: 18/18 headless checks), and committed.**

| Phase | Commit | Result |
|---|---|---|
| R0 search as routed page | `66be836` | 42/42 checks |
| R1 gallery lightbox as URL state | `f29e7eb` | 29/29 + 5/5 checks |
| R2 page modals as query params | `a33a54b` | 16/16 checks |
| R3 delete the coordination layer | `3e5c6dd` | 21/21 checks |
| R4 unified motion system + infra | `e730ee4` | 15/15 checks |
| R5 full regression verification | — | 18/18 checks, 0 console errors |

---

## 1. Goal & principles

1. **Navigation = the URL.** Every navigable state is encoded in the hash. Back is the browser's own behavior — no `pushState` same-URL entries, no popstate coordination, no depth refs.
2. **One overlay taxonomy** (below) instead of four competing patterns.
3. **One motion system** — single duration source, one exit-fade hook, one reduced-motion gate, every overlay on the same open/close envelope.
4. **Delete, don't patch.** The coordination layer, the three session hooks, and all timer-based close machinery are removed, not fixed up.

## 2. Target route shapes

| Hash | What renders | Overlay state |
|---|---|---|
| `#/` | Home | `?modal=settings` opens the settings panel |
| `#/search[?q=…]` | SearchOverlay as a **routed page** | query = `?q=` (synced via `history.replaceState`, never pushes) |
| `#/photos[?photo=N]` | Photos page | `?photo=N` opens the lightbox on photo N |
| `#/ride/:id[?modal=map\|photo\|arrange]` | Ride detail | page-level modals via `?modal=` |
| `#/leg/:id[?modal=map\|photo\|arrange]` | Leg detail | page-level modals via `?modal=` |
| `#/edit?mode=…[&modal=arrange]` | Editor | arrange sheet via `&modal=arrange`; map picker / coordinate paste stay plain state |
| `#/backup`, `#/todo` | unchanged | — |
| (other) | 404 | — |

Query parsing: extend the existing `useHashSearch` (App.tsx:78–83) into a shared `useRouteQuery()` (hash + query params + setter) used by pages and modals.

## 3. Overlay taxonomy after the refactor

| Class | Members | State lives in | Back behavior |
|---|---|---|---|
| **Routed overlays** | search (`#/search`) | the route itself | native `history.back()` |
| **Query-param modals** | settings, map, photo, arrange, lightbox | `?modal=` / `?photo=` on the host route | removing the param pops the entry |
| **Plain dialogs** (transient, not deep-linkable) | confirm (delete), info prompts (PWA), map picker, coordinate paste, dropdown, toast | component state | none |

**Search-as-page design consequence (flagged for sign-off):** search becomes a full-screen route — Home fades out via the normal route transition instead of staying dimmed beneath an overlay. In exchange: consistent transition, native back, deep-linkable queries (D15 lands), and the `?q=` param restores the query when Back returns from a result.

## 4. Search specifics (R0 core)

- `isOpen = path === '/search'`; rendered in the Router's viewport (full-screen sheet, max-width 480, paper styling preserved).
- Query: read `?q=` on mount/param change; on input → `history.replaceState` with the new `?q=` (no history entries; light 150ms debounce optional).
- UX preserved: journal (empty query) / suggestions (typing) / catalog (after Enter) / stub. `committed` becomes local state reset on query change — the old "committed never resets on close" bug disappears structurally.
- Close (× / Escape / backdrop): `history.back()`. Direct-load-on-`#/search` with no prior entry → back exits the app (standard mobile-web; acceptable, noted).
- Result tap → `#/ride/:id` (normal hash push); Back returns to `#/search?q=…` with the query restored; recents recorded on navigate.
- Body scroll locked while `path === '/search'` (ref-counted lock).

## 5. Motion system (first-class workstream — spec'd now, implemented in R4)

- **Duration tokens** in `:root`: `--motion-fast: 150ms`, `--motion-base: 220ms`, `--motion-slow: 300ms`. Every open/close/route animation references tokens — no magic numbers.
- **One exit-fade hook**: `useExitFade(isOpen, duration = 220)` replaces ALL manual `closing` + `setTimeout(250)` patterns (search-overlay, confirm-modal, info-modal, map-modal, map-picker, home settings). The JS timer duration is the single source the CSS uses.
- **One overlay envelope** for every modal/overlay: open = backdrop `fade-in 150ms` + content `slide-up 300ms` (existing keyframes); close = `fade-out 220ms` + `slide-down 220ms`; JS unmount timer exactly 220ms. Search sheet gains an open/close envelope too (currently it has NO closing animation — only the backdrop fades).
- **One global reduced-motion gate**: keep the existing `* { animation-duration: 0.01ms; transition-duration: 0.01ms }` block (~3811); DELETE the search-scoped (~1922) and lightbox (~4277) duplicates. `useExitFade` must also honor reduced-motion (duration → 0 via `matchMedia`) so closes aren't silently delayed by 220ms.
- Route transition unchanged (viewport opacity 0.18s / preparing 0.12s) — it now also covers search, which is the consistency win.

## 6. Supporting infrastructure (R4)

- **`useBodyScrollLock` → ref-counted** (module counter): two overlapping locks must not unlock early (current snapshot bug). Add locks to map modal and photo overlay, which currently DON'T lock.
- **Focus standard**: `useOverlayFocus(active, ref)` — focus first focusable/close button on open, trap Tab, restore previous focus on close. Adopt everywhere (confirm/info already do most of it).

## 7. Deletion list

- Files deleted: `src/ui/use-search-session.ts`, `src/ui/use-gallery-session.ts`, `src/components/use-history-modal.ts`.
- App.tsx: `navDepthRef`, `skipDepthRef`, `prevHistoryLenRef`, `handlePopState` delegation, `onRouteLeaving`/`onRouteSwapped` callbacks, session wiring, shell-mounted SearchOverlay/PhotosOverlay (now route-rendered), `navigateBack` depth logic → simple logical-parent hash navigation.
- search-overlay.tsx: `closing` state, `handleClose` 220ms timer, `closeRequest` prop + effect, `handledCloseRequestRef`, `closePhaseRef`, dual closing flags.
- photos-overlay.tsx / map-modal.tsx / photo-overlay.tsx: session props / unconditional popstate listeners.
- styles.css: duplicate reduced-motion blocks; all `transition: all` in overlay paths (list properties).

## 8. Migration order — every phase lands green and commits

| Phase | Scope | Gate |
|---|---|---|
| **R0 — Search as route** | `/search` route + route-driven SearchOverlay + `?q=` replaceState sync; close = `history.back()`; delete `use-search-session` + App wiring; body-scroll-lock on route | build + headless: open/close, back-restores-query, journal/recents, suggestions, catalog, stub |
| **R1 — Gallery lightbox** | `#/photos?photo=N`; delete `use-gallery-session` | build + headless lightbox open/close/back |
| **R2 — Page modals** | `?modal=` for settings/map/photo/arrange (home/ride/leg/editor); delete `use-history-modal` + popstate nets | build + headless each modal open/close/back |
| **R3 — Delete coordination layer** | navDepth/skipDepth/prevHistoryLen refs, handlePopState, route-leaving/swapped callbacks, `navigateBack` → logical-parent hash; PageHeader back simplified | build + headless full journey (home→ride→leg→editor→backup back buttons, delete flows) |
| **R4 — Motion system + infra** | duration tokens, one `useExitFade` (220), one reduced-motion gate, overlay envelope everywhere incl. search sheet, ref-counted scroll lock, focus standard, locks on map/photo | build + headless: timer/CSS sync, reduced-motion emulation (closes not delayed), two-overlay scroll-lock |
| **R5 — Full regression verification** | re-run every prior check + the original glitch path (close → no flicker), animations, back behaviors, "no flashes during transitions" | headless + manual walk; fix findings |

## 9. Risk register

- **Query-restore regressions** (R0/R5 verify covers: search reopen, back-from-result).
- **"No error/empty flashes during route transitions"** design principle (R0/R3 verify).
- **Editor interplay** — `stillEditorRoute`, `triggerClose` 100ms, save redirects (R3 verify).
- **Scroll position loss on Back** (R5 verify).
- **Migration ordering** — R0 removes the search session; only App.tsx referenced it (confirmed by audit). R3 must wait until R1/R2 remove the remaining session consumers.
- **OAuth / gdrive / editor data flow**: untouched (verified non-overlapping).

## 10. Explicitly out of scope (scope discipline)

- Confirm/info modals keep plain state (they adopt the motion envelope in R4, nothing else).
- MapPicker/CoordinatePaste keep plain state (gain scroll-lock + focus in R4).
- OAuth flow, backup/restore data flow, editor form logic.
- No new design tokens beyond the motion tokens; no visual redesign of pages.
