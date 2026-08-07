# Retread — Search Deep-Link Scroll-to + Highlight Plan

Companion to `SEARCH-REDESIGN-PLAN.md` (search UI) and `../architecture/NAV-REFACTOR-PLAN.md` (routing). This feature closes the "why did this match?" loop: clicking a search result navigates to the target page, scrolls to the matched element, and briefly highlights the matched term. Generalized across all result types (note, stop, leg-title, ride-title), not note-only.

Status: **plan for review.**

---

## 1. Goal

From any search result, deep-link with the match target + term encoded in the URL, then on arrival: scroll to the matched element (not hidden under pinned chrome) and flash-highlight the matched term for ~1.2s. Degrade gracefully when the term isn't literally present. Respect reduced motion.

## 2. Deep-link model

Every result builds a route carrying the match:

| Result type | Route | `scrollTo` | Target element |
|---|---|---|---|
| Note match (margin note, `label:'note'`) | `#/leg/:id?scrollTo=note&q=<term>` | `note` | leg-page `<blockquote class="typewriter-blockquote">` |
| Leg-title match (leg row) | `#/leg/:id?scrollTo=title&q=<term>` | `title` | leg hero `<h1 class="ride-hero-title">` |
| Stop match (margin note, `label:'stop'`) | `#/leg/:id?scrollTo=title&q=<term>` | `title` | leg hero title (see §6 — no stop anchor on the leg page) |
| Ride-title match (ride row) | `#/ride/:id?scrollTo=title&q=<term>` | `title` | ride hero `<h1 class="ride-hero-title">` |

- `q` is URL-encoded. The term + field are known at the `buildSearchCatalog` row-build site (`search-overlay.tsx` ~240–420) — that's where the route string is assembled.
- `useRouteQuery` (`use-route-query.ts:24–36`) is key-specific; add `scrollTo: params.get('scrollTo')` to the parser + `RouteQuery` interface. `q` already exists on the hook (pages currently ignore it).
- Add stable ids to the targets: `id="leg-note"` on the blockquote, `id="leg-title"` / `id="ride-title"` on the hero titles (none exist today).

## 3. The critical gotcha: App's scroll-restore

`App.tsx`'s hashchange effect caches `scrollY` and calls `restoreScroll` ~120ms after a route swap (`App.tsx:190–255`) — it will **overwrite** a deep-link `scrollIntoView` that runs on mount. Fix: **exempt navigations whose incoming hash carries `?scrollTo=`** from scroll restoration (don't cache/restore for those routes) — let the target page own the scroll. Without this, the feature is timing-fragile.

## 4. The scroll-highlight hook

New `src/components/use-scroll-highlight.ts` — `useScrollHighlight(target?, q?)` read from `useRouteQuery`:

1. On mount (or when the params change under the page), resolve the target element by id.
2. `scrollIntoView({ behavior: 'smooth', block: 'start' })` with `scroll-margin-top`:
   - Leg page (PageHeader only): `calc(var(--sticky-topbar-inset) + var(--sticky-topbar-offset))` = **55px** (mirrors `.month-group` at `styles.css:977`).
   - Ride page (PageHeader + sticky day-group header): `calc(var(--sticky-topbar-inset) + var(--sticky-topbar-offset) + 38px)` = **93px** (mirrors `.timeline-card-item` at `styles.css:3222`; the canonical `scrollToLeg` precedent is `ride-detail.tsx:310–313`).
3. Highlight: locate the term in the target's text node (reuse the matcher's `normalize()`/`findTermInText` from `src/ui/search-match.ts`), wrap occurrences in `<mark class="search-flash">` (a temporary variant — see §5).
4. After ~1.2s, fade out and remove the mark.
5. **Degradation:** if `q` is not found literally in the target (truncated note on the ride page, stop-not-in-title mismatch) → scroll only, no mark.
6. **Reduced motion:** check `matchMedia('(prefers-reduced-motion: reduce)')` — do the scroll (the CSS gate already sets `scroll-behavior: auto`), but skip the flash animation (a JS class-toggle isn't covered by the CSS gate). Pure scroll, no flash.

## 5. Highlight treatment

- New class `.search-flash` — a softened, temporary mark, NOT the persistent bold `.search-hit`. Recommend a keyframe: fade-in ~200ms, hold, fade-out ~400ms over ~1.2s total, using `--motion-fast`/`--motion-slow` tokens; background a softened green-light or paper-dim sweep (not the solid green of `.search-hit`).
- The existing `highlight()` in `search-overlay.tsx:25–40` emits `<mark class="search-hit">` — reuse its slicing logic but emit `.search-flash` for the temporary target-page mark.

## 6. Open design decision — stop matches

The leg page has **no stop-name text anchor** (the stop label exists only in the map pins and the ride-page leg-card, per the structural audit). Two options:

- **A (recommended):** stop matches → leg page, `scrollTo=title`. The leg title auto-derives from the destination label (UX-PLAN), so the stop name is usually in the title — highlight if present, else scroll-only. Simple, no navigation change.
- **B:** stop matches → the ride page's leg-card (which renders the location badge with the stop), `scrollTo=leg-card` + the existing `leg-card-{id}` id. More accurate highlight, but changes stop results to land on the ride page instead of the leg.

Recommend **A** (keeps stop results on the leg page, consistent with the other leg targets, best-effort highlight).

## 7. Implementation phases (green + committed)

| Phase | Scope | Files | Gate |
|---|---|---|---|
| **P1 — scroll-to** | `?scrollTo=&q=` deep-link params from search results; `useRouteQuery` + `scrollTo`; ids on title/note; `useScrollHighlight` doing scroll-only; App scroll-restore exemption for `?scrollTo=` routes | `search-overlay.tsx`, `use-route-query.ts`, `leg-detail.tsx`, `ride-detail.tsx`, new `use-scroll-highlight.ts`, `App.tsx`, `styles.css` (scroll-margin ids) | build + headless: click a note result → lands on the leg note not under the sticky bar; ride-title result → ride hero; restore doesn't clobber |
| **P2 — highlight flash** | `.search-flash` keyframe + softened mark; wrap + timed removal; reduced-motion gating; degradation (scroll-only when term absent) | `use-scroll-highlight.ts`, `styles.css` | build + headless: term highlighted, fades out ~1.2s; no flash under reduced-motion; absent-term case scroll-only |

## 8. Scope discipline / out of scope

- No change to the search results UI itself (snippets, marks, grouping stay as-is).
- No change to modal/photo/map behavior. No new dependencies.
- The ride-page leg-card note stays 95-char clamped (not a highlight target — the leg-detail full note is).
- Reduced-motion handled per the app's existing `matchMedia` pattern.

## 9. Verification

- `npm run build` after each phase.
- Headless (Chrome DevTools MCP / puppeteer as before, 390×844, seeded demo): for each result type (note, stop, leg-title, ride-title) — click from search, assert the correct URL params, the page scrolled to the element with the right offset (not under pinned chrome), the term is highlighted (P2), and it clears ~1.2s later. Reduced-motion emulation: scroll happens, no flash. Absent-term case: scroll only. No console errors.
