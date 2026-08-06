# Retread — Search Redesign Plan

Companion to `UX-PLAN.md` (ride/leg flows) and `PLAN.md` (architecture). This document is the working plan for redesigning the search experience — the **function** side (what to build, why). The **form** side (what it should look like) lives in `SEARCH-UI-DESIGN-PLAN.md`, the lead-designer UI pass; its decisions (D1–D15) are folded into the phases here. The underlying best-practice research lives in the project skill `.agents/skills/mobile-search-ux/` (see the appendix).

Status: **approved for planning — implementation phases below are ready to dispatch.**

---

## 1. Background & current state

### 1.1 Architecture (keep it)

Search is a **shell-level overlay**, not a routed page:

- `SearchOverlay` renders as a sibling of `<main class="viewport">` in `App.tsx` (`App.tsx:388–398`), per the AGENTS.md rule: overlays whose action leaves the host page (search results deep-link to `#/ride/{id}` / `#/leg/{id}`) must live at App shell level.
- Driven by `useSearchSession` (`src/ui/use-search-session.ts`): open pushes a real history entry so Browser Back restores the overlay; navigating to a result keeps the query so Back reopens it.
- Entry: magnifier icon button in the Home header (`src/ui/home.tsx:272–278`).

**Decision: the redesign keeps the overlay architecture. We do not turn search into a routed page.**

### 1.2 Files involved

| File | Role |
|------|------|
| `src/ui/search-overlay.tsx` (294 lines) | The search UI: input, result list, states, `buildSearchResults` (`:60–108`), `highlight` (`:33–47`), `SearchThumb` (`:110–143`), `SearchOverlay` (`:145–294`) |
| `src/ui/use-search-session.ts` (168 lines) | Session state: open/close/query, history coordination |
| `src/App.tsx` (422 lines) | Route registration (`:327–360`), overlay wiring (`:388–398`), session hook (`:100`), back coordination (`:210, 217, 240, 285`) |
| `src/ui/use-ride-book.ts` (106 lines) | Data source: Dexie live query → `HomeRideEntry[]` (with `coverUrlCache`) |
| `src/db.ts` | Dexie DB: `rides`, `legs` tables |
| `src/styles.css` | Search CSS block `:1273–1465`; `.modal-backdrop` `:586–602`; `.note-label` `:3070–3073` |
| `src/components/use-body-scroll-lock.ts`, `src/components/use-exit-fade.ts` | Overlay helpers |

### 1.3 What already works

- Instant substring matching across ride titles, stop names, leg titles/locations, notes (with ±30/40-char context windows).
- `<mark class="search-hit">` highlighting of matched terms.
- Per-ride result cards: cover thumbnail, highlighted title, date-range + distance meta, up to 2 labeled snippet rows (RIDE / STOP / LEG / NOTE·leg) that deep-link to ride or specific leg.
- Query preserved on navigate-to-result (Back restores the same query).
- Escape / × / backdrop close with 220 ms exit fade; body scroll locked; input auto-focused on open.

### 1.4 Problems (ranked by user impact)

| # | Problem | Evidence |
|---|---------|----------|
| 1 | **Dead-end pre-search state** — always "Type to search rides, stops and notes." No recents, no hints, no sense of what's searchable | `search-overlay.tsx:243–247` |
| 2 | **Zero debounce, full rescan per keystroke**, no `useMemo`/`useDeferredValue` → jank on large books | `search-overlay.tsx:215, 239` |
| 3 | **No suggestions** — no suggestion layer, no keyboard result navigation (only Escape works) | `search-overlay.tsx:186–195` |
| 4 | **Naive matching** — `includes()` substring, no normalization, no scoring; 1-char queries match aggressively | `search-overlay.tsx:60–108` |
| 5 | **No recent-search persistence** — query is memory-only `useState('')`, nothing in localStorage | `use-search-session.ts:38` |
| 6 | **No-results is a bare message** — no recovery affordances | `search-overlay.tsx:245` |
| 7 | **No focus trap, no combobox ARIA semantics**, no loading state (flash of empty while Dexie live query in flight) | `App.tsx:392` |
| 8 | **Snippet dedup bug** (same stop can appear as STOP and STOP·leg); **count shows rides, not total matches** | `search-overlay.tsx:68–70, 249–251` |

---

## 2. Design goals

1. **Find faster** — suggestions + recents turn "hunt through the book" into two taps.
2. **Know why it matched** — every result card states its matched field with the term highlighted in context.
3. **Never lose state** — query, recents, and scroll survive navigation (deep-linking is the whole point of this feature).
4. **Never dead-end** — every empty state offers a recovery path, never a bare message.
5. **Ergonomic + accessible** — thumb-reachable controls, 44px targets, labeled input, full keyboard contract, keyboard dismissed on navigate.

---

## 3. Target interaction — five states

The input is **always visible** at the top of the sheet: leading magnifier, `type="search"`, trailing clear (×) that appears only when text exists, plus a submit affordance.

### State A — Pre-search (idle query)
*Recent searches* (persisted, capped ~6–10, most-recent-first, deduped, one-tap "Clear") + a small set of curated example searches + a quiet line showing how many rides are in the book. Replaces the bare "Type to search…" line. Apple explicitly endorses recents before search begins; this is the highest-value surface for a personal archive where the user re-finds the same rides.

### State B — Typing (suggestions)
A capped **4–8 item** suggestion list built **only from real rides/legs/stops** (a suggested term is implicitly endorsed — never suggest something that returns nothing). Predictive portion highlighted (not the repeated typed chars); scope (country / RIDE vs LEG) styled distinctly and muted. Active item visibly highlighted. Doubles as the keyboard-navigation surface (↓/↑ move, Enter commits, Escape closes).

### State C — Results
Grouped under headers with counts — **Rides · Legs**. Each card: large tappable title, matched field made explicit with the term highlighted in context, 2–3 scannable metadata lines (date range, distance, place). Default sort = relevance, then recency. "N of M" count line. Snippet dedup fixed.

### State D — No results
Never a bare message. Recovery ladder: tolerant matching → alternative search suggestions with 2–3 item previews → "Browse all rides" → recent items.

### State E — Loading
Skeleton cards matching the result-card shape while the Dexie live query resolves. Local search itself resolves <100 ms (no spinner needed for keystrokes); skeletons cover the initial book load only.

---

## 4. Matching & ranking

Replace `includes()` scanning with a lightweight scored token matcher, still in-memory over `useRideBook()`:

- **Normalize** (lowercase, strip accents); word-boundary-aware matching — fixes 1-char-query noise.
- **Score:** title/stop-name prefix match > name substring > note substring; recency tiebreak (results already sort `startDate desc`).
- **Tolerant matching** for the no-results state (edit-distance ≤ 1–2 chars → "Did you mean…").

---

## 5. Recent-search persistence

- **Storage: `localStorage`** under key `retread-search-recents` (short JSON list; synchronous; read once per overlay open). Written on submit/selection, not per keystroke.
- Cap ~6–10 entries, dedupe, most-recent-first, one-tap clear-all.
- Query text also survives within the session (already true) — recents make it durable across sessions.

---

## 6. Accessibility & ergonomics contract (WCAG 2.2 / WAI-ARIA APG)

- Input: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`; suggestions are a `role="listbox"` with `aria-selected` options; active option via `aria-activedescendant` — focus never leaves the input (APG Combobox pattern).
- Keyboard: ↓/↑ through suggestions, Enter submits, Escape closes, Tab does not escape the modal (**add focus trap** — currently missing).
- `type="search"` → labeled "Search" keyboard key on mobile.
- **Submit affordance**: keyboard Search key + suggestion selection + explicit submit on the field (Baymard's strongest mobile finding; Apple + Baymard disagree in emphasis — implement both).
- **Dismiss keyboard on navigation** to a result; restore query + sheet on Back (already partially handled — keep).
- 44px touch targets on all rows; ≥4.5:1 contrast on muted scope text; visible `:focus-visible` states (repo already has the pattern per USER_JOURNEYS Journey 30).

---

## 7. Visual language

Stays on paper background, typewriter/mechanical fonts, dashed hairlines. The redesign is **structural**, not a visual rebrand. New bits reuse existing tokens: suggestion scope tags use the `note-label` treatment; result-group headers reuse the body-heading style; the sticky `search-top` bar keeps the documented Chrome padding-edge quirk fix (`styles.css:1288–1289`). No new design tokens.

### 7.1 UI design direction (lead-designer pass)

See `SEARCH-UI-DESIGN-PLAN.md` for the full element-by-element spec, wireframes, and the Web Interface Guidelines mapping. The design concept: **search is an index into the logbook, not a stack of boxes.** Summary of the decisions that change the phases here (full table in the UI plan §4):

- **D1 Ledger-line field** — borderless input on a dashed hairline, mechanical kicker label, leading magnifier, trailing clear × (44px target), green focus ring (fixes the current shadow-only ring at `styles.css:1332–1335`). Phases 0 + 2.
- **D2 Sectioned catalog** — results grouped into RIDES / LEGS with mechanical-font headers + counts; the old `.search-count` rides line is removed. Phase 3.
- **D3 Index rows** — borderless 44px rows separated by dashed hairlines (not bordered mini-cards); the 24px result gap becomes the section gap. Phase 3. Fallback spec (timeline-card language) available if card consistency wins.
- **D4 Inverse-green hit mark** — `.search-hit` becomes `background: var(--color-green); color: var(--color-paper)` (the app's own `::selection` language). Phase 0 — two-line CSS change, largest perceptual payoff.
- **D5 Margin-note snippets** — inline mech label prefix (`stop:` / `note:`), 1px dashed left rule, 2-line clamp, deduped. Phases 0 (dedupe) + 3 (visual).
- **D6 Day-color swatches on leg rows** — plumb `DAY_COLORS` into search results; leg rows drop thumbnails. Phase 3.
- **D7 Pre-search journal** — recents + derived suggested searches + `YOUR LOG · N RIDES` marginalia + CLEAR ALL. Phase 1.
- **D8 No-results stub** — dashed-border journal stub with fix-first second-person copy. Phase 3.
- **D9 Skeleton index** — row-geometry skeletons for the initial book load. Phases 0 + 3.
- **D10 Suggestion panel** — dashed-top-hairline panel, 44px rows, scope tags, predictive tail in green. Phase 2.
- **D11–D14 Motion & polish** — reduced-motion block + explicit transition properties; touch-action / overscroll-behavior / aria-live on section counts / 44px audit; tabular-nums, `…`, curly quotes, copy standards; lazy thumbs. Phases 0 + 4.
- **D15 URL-synced query (optional, deferred)** — `#/search?q=…` for deep-linkable search; revisit after Phase 4.

---

## 8. Phased implementation

Each phase lands, builds, and is verifiable independently.

### Phase 0 — Hygiene + mark swap (D1/D4/D9/D14)
- `useDeferredValue` + `useMemo` on results computation.
- Snippet dedup (same source stop appearing as STOP and STOP·leg).
- Count semantics feed the section counts (D2); intermediate: matches, not rides.
- Focus trap on the overlay.
- No flash of empty while `ridesData` loads (skeleton index base, D9).
- `.search-hit` → inverse-green chip: `background: var(--color-green); color: var(--color-paper)` (D4).
- `.search-input:focus` → green ring `3px 3px 0 var(--color-green-light)`, matching `.form-input:focus` (D1 fix).
- Thumb `loading="lazy"` (D14).

**Files:** `src/ui/search-overlay.tsx`, `src/App.tsx`, `src/styles.css`
**Gate:** `npm run build`

### Phase 1 — Pre-search journal + recents (D7/D13)
- New `use-search-recents` hook (localStorage read/write, cap, dedupe, clear-all).
- State A as a journal page: RECENT SEARCHES index rows (dashed hairlines), SUGGESTED derived searches (from recently-logged ride/stop names — derived, not static copy), `YOUR LOG · N RIDES` marginalia, CLEAR ALL margin action.
- Wire recents write on submit/selection.
- Copy standards sweep: second person, numerals, `…`/`·`, curly quotes (D13).

**Files:** `src/ui/use-search-session.ts`, new `src/ui/use-search-recents.ts`, `src/ui/search-overlay.tsx`, `src/styles.css`
**Gate:** `npm run build` + manual walk

### Phase 2 — Ledger field + suggestion panel (D1/D10)
- Field restructure: mechanical kicker label, borderless typewriter line on a dashed hairline, leading magnifier, trailing clear × (44px, `aria-label`), `type="search"` + `enterkeyhint="search"`, `autocomplete="off"`, `spellCheck={false}` (D1).
- Suggestion panel: capped 4–8 rows from real entities, dashed top hairline, 44px rows, scope tags (RIDE/LEG/country), predictive tail in green, active row = paper-dim wash + green rule.
- Combobox ARIA (role/aria-expanded/aria-controls/aria-activedescendant), keyboard contract (↓/↑/Enter/Escape).
- Keyboard search key + explicit submit affordance.

**Files:** `src/ui/search-overlay.tsx`, `src/styles.css`
**Gate:** `npm run build` + keyboard walk

### Phase 3 — The catalog (D2/D3/D5/D6/D8)
- Sectioned results: RIDES / LEGS headers with counts + dashed rules (D2); remove `.search-count`.
- Index rows: borderless 44px rows separated by dashed hairlines, full-row tap target, green left rule + paper-dim wash on hover; drop the 24px result gap (D3). Fallback spec: timeline-card bordered language.
- Row typefaces: 14px bold typewriter title (1-line truncate), mech 10px uppercase meta with tabular-nums.
- Margin-note snippets: inline mech label prefix (`stop:`/`note:`/`ride:`), 1px dashed left rule, 2-line clamp, max 2 per row, deduped (D5).
- Day-color swatches on leg rows (no thumbnails on legs); plumb `DAY_COLORS` (D6).
- Why-they-matched emphasis via the green mark (D4, from Phase 0).
- No-results stub: dashed-border journal stub with fix-first copy + recovery ladder; tolerant matching (D8).

**Files:** `src/ui/search-overlay.tsx` (+ matcher util), `src/styles.css`, day-color plumbing
**Gate:** `npm run build` + Journey 22 walk (USER_JOURNEYS.md)

### Phase 4 — Motion, polish & verify (D11/D12)
- `prefers-reduced-motion` block for all search animations; explicit transition property lists (no `transition: all`); section-header reveal (translateY 8px + fade, 150 ms, 30 ms stagger) (D11).
- Touch: `touch-action: manipulation` on rows/suggestions, `overscroll-behavior: contain` on `.search-sheet`, `aria-live="polite"` on section-count header, 44px hit-target audit, contrast audit incl. all 7 themes (D12).
- Keyboard-dismiss on navigate; autofocus/keyboard-fold check on State A.
- Headless Chrome measurement at 390×844 — **only after user approval** (AGENTS.md requires asking before any browser session).
- Optional: `web-design-guidelines` skill compliance pass.

**Files:** CSS pass + probe script
**Gate:** `npm run build` + measurement

---

## 9. Verification (applies to every phase)

- `npm run build` (`tsc -b && vite build`) after each phase.
- Manual walk at 390×844; keyboard-only walk for Phase 2+.
- Headless measurement only with explicit user approval (AGENTS.md rule).

---

## 10. Decisions

Recorded defaults (recommended options; adjust on request):

1. **Scope: full phased redesign** (Phases 0–4). Alternative: Phase 0+1 only, or visual polish only.
2. **Keep the overlay architecture** — search stays at App shell level, not a routed page.
3. **Recents in `localStorage`** (`retread-search-recents`), not a Dexie table.
4. **No country/type filter chips this round.** Default = broadest scope with refine-after (Baymard/Apple agree); recents + suggestions + tolerant matching deliver more value for a personal book. Chips can be a later additive phase without rework.
5. **Debounce:** local in-memory data → run per keystroke with `useDeferredValue`/`useMemo`; introduce 200–400 ms trailing debounce only if profiling shows jank. Never show stale results with a newer query.
6. **UI direction:** per `SEARCH-UI-DESIGN-PLAN.md` — index rows over bordered mini-cards (D3, fallback spec ready), inverse-green match mark (D4), autofocus kept on open (user-invoked search; keyboard-fold constraint on State A), URL-synced query deferred past Phase 4 (D15).

Open questions (not blocking):
- Whether "Browse all rides" in State D should deep-link or reveal in-place (recommend: reveal in-place).

Resolved during implementation:
- **Cyberpunk holds** — neon green `#00ffcc` vs near-black paper ≈ 15.2:1 (verified in the Phase 4 contrast audit).
- **Dark-theme contrast fixed app-wide** — nightfall/midnight/slate (and sepia's muted ink) green + ink-muted token values lifted to clear 4.5:1 in all 7 themes (commit `3497daf`, `src/styles.css` theme overrides only).

---

## Appendix — research basis

The full, detailed best-practice guide (sources: Nielsen Norman Group, Baymard Institute, Apple HIG, Google Material Design 3, WAI-ARIA APG, WCAG 2.2, Smashing Magazine) is saved as the project skill:

- `.agents/skills/mobile-search-ux/SKILL.md` — overview, quick-reference top 10, when-to-use.
- `.agents/skills/mobile-search-ux/mobile-search-ux-guide.md` — the complete reference (input behavior, recents, filtering, result presentation, ergonomics, accessibility, anti-patterns, source URLs).
- `SEARCH-UI-DESIGN-PLAN.md` — the lead-designer UI pass (the form): element specs, wireframes, Web Interface Guidelines mapping, and the D1–D15 decision table feeding this plan.
