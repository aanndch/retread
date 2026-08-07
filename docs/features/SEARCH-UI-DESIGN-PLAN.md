# Retread — Search UI Design Plan (Lead Designer Pass)

The **form** companion to `SEARCH-REDESIGN-PLAN.md` (the **function** plan). Where that file says *what* to build and *why it works*, this one says *what it should look like and feel like* — element by element, grounded in the app's real design system. The evidence base is the project skill `.agents/skills/mobile-search-ux/` (research) plus the Web Interface Guidelines (Vercel Labs) applied to the actual code.

Design principle for this pass: **search is an index into the logbook, not a stack of boxes.** Everything below follows from that single assertion.

---

## 1. The design concept — "The Index"

The app's aesthetic is a paper field-logbook: paper `#f4efe6`, ink `#2b2926`, pale-gold paper-dim `#ebdcb9`, a single green accent `#4a5d4e` (used for selection and focus), Space Mono typewriter + JetBrains Mono mechanical, 4px sharp radii, hard offset shadows, dashed hairlines as the "list/annotation" signifier (only the page-header and timeline-empty use dashes today).

The current search sheet is already framed like a document page (1px ink left/right borders, `.search-sheet`). But inside, it renders results as **mini-boxes** — flat, equally-weighted, ungrouped. That's a *shelf* metaphor for what should be a *card catalog*.

**The assertion:** Home is the shelf (bounded cards with photos, lift shadows). Search is the index (open rows, hairline rules, marginalia). The two should not look alike — the moment search renders cards, it stops reading as "a place to find things."

Concrete consequences:
- Index rows are **borderless, separated by dashed hairlines**, 44px tall — not bordered mini-cards.
- The input is a **ruled ledger line**, not a boxed field.
- Results are **grouped into sections** (RIDES / LEGS) with mechanical-font headers and counts — like the index of a book.
- The match highlight is the **only saturated element** — inverse green chip, matching the app's own `::selection`.
- Empty states are **journal entries**, never dead-end lines.

---

## 2. Current search UI — the designer's critique

Ground truth (from the code): `.search-input` (`styles.css:1320–1335`) is a boxed field identical to `.form-input`, with a **focus ring that uses a shadow, not the app's green ring** (inconsistent with every other field); `.search-result-main` (`:1368–1381`) is a 1px-ink bordered mini-card with a 1px shadow and a **13px non-bold title** (same weight as body text — the anchor of the row doesn't anchor); `.search-results` (`:1354–1359`) uses a **24px gap** between results — sparse and ungrouped; `.search-snippet` (`:1425–1444`) already carries a 2px solid left rule but stacks a tiny 8px label **above** the text (two lines per snippet → label noise); `.search-hit` (`:1459–1465`) is paper-dim-on-paper — **nearly invisible** (contrast between `#ebdcb9` and `#f4efe6`); `.search-empty` (`:1346–1352`) is one centered muted line — a dead end.

The numbered problems, as a designer sees them:

1. **The field doesn't look like the entry point.** It's a generic form box, no leading magnifier, no clear button, wrong focus treatment (`styles.css:1320–1335`). The guidelines demand a leading icon, trailing clear, and the green focus ring — all missing or inconsistent.
2. **Flat result list, no structure.** Rides and legs interleave in one date-sorted list; nothing tells the eye "this is a ride, this is a leg" except tiny stacked labels. The user can't scan by type (`styles.css:1354–1359`).
3. **Rows are boxes, not index entries.** Bordered + shadowed mini-cards with a 24px gap = sparse, boxy, heavy. The app's own timeline cards justify borders; search rows don't (`styles.css:1361–1386`).
4. **The title is the weakest element in the row.** 13px, regular weight — visually equal to the meta line it should dominate (`styles.css:1412–1416`).
5. **The match highlight is invisible.** paper-dim on paper fails at its one job: making the user see *why* this row matched (`styles.css:1459–1465`).
6. **Snippets are noisy and stacked.** An 8px uppercase label on its own line above each snippet turns every context line into a two-line control; same-source stops can appear twice (STOP + STOP·leg) (`styles.css:1425–1452`).
7. **The count line lies by omission.** "N rides" understates matches, and with no sections there's no place for real numbers (`styles.css:1337–1344`).
8. **Empty states are dead ends.** One centered line for "no query" and one for "no matches" (`styles.css:1346–1352`).
9. **Thumbs are ride identity only when they're present** — but every row fights for a 48px square, including legs whose identity is a date and a place, not a photo.
10. **No motion language, no reduced-motion handling** — rows pop in with nothing; transitions aren't gated.

---

## 3. The redesign — element by element

### 3.1 The field — a ruled ledger line

Replace the boxed `.search-input` with an open line that behaves like a form on paper: a mechanical-font kicker above, the field itself, a hairline below.

```
 SEARCH                            ← mech 10px, ink-muted, uppercase (kicker)
 ⌕ Search rides, stops & notes…   ×  ← typewriter 15px, no box; × appears when text
 ─────────────────────────────     ← 1px dashed hairline (the "ruled line")
```

Spec:
- Kicker: reuse the `.card-title-row` treatment (mech 10px, uppercase, letter-spacing 0.5px, ink-muted) — the same kicker voice as the editor's "Where does this ride begin?".
- Field: `font: 15px var(--font-typewriter)`, ink on paper, **no border**; leading SearchIcon (already exists in the app) in ink-muted; trailing clear `×` — **44px hit target**, only rendered when the query is non-empty, `aria-label="Clear search"`.
- The dashed hairline sits directly under the field and IS the field's bottom edge — when focused, the hairline turns green and the app's standard offset ring (`3px 3px 0 var(--color-green-light)`, matching `.form-input:focus` at `styles.css:1503–1509`) appears. This fixes the current shadow-only focus inconsistency.
- `type="search"`, `enterkeyhint="search"`, `name="q"`, `autocomplete="off"`, `spellCheck={false}` (tolerant matching is the spellcheck), `aria-label="Search rides, stops and notes"`.
- **Autofocus stays** (the user explicitly tapped the search icon — the guideline's "avoid autoFocus on mobile" targets generic pages, not invoked search). Design constraint: the pre-search state must keep the first 2–3 recent searches visible above the keyboard fold.

### 3.2 The catalog — sectioned results

Results render as two (optionally three) sections with mechanical-font headers and counts. Sections with zero matches are absent.

```
 RIDES · 3 ────────────────────────────     ← mech 10px uppercase + dashed rule + count
   [Manali → Kaza]            RIDE · 12–18 AUG 2026 · 486 KM
     stop: “…the pass was closed…”
 LEGS · 5 ────────────────────────────
   ● Jispa → Sarchu          LEG · 13 AUG 2026 · 104 KM
```

- Header: `label · count` left, flex-1 dashed hairline to the right edge (echoes the page-header's dashed rule). Uses tabular-nums for the count.
- Section gap 24px, row gap 4–8px. The old 24px result gap dies inside sections (it becomes the section gap).
- **Information architecture** (this replaces the flat list):
  - **RIDES** — rides whose *title* matched. Margin-note context lines beneath (notes/stop matches that live inside the ride), deep-linking to the leg when tapped.
  - **LEGS** — legs whose *title, location, or stop name* matched, each with the day-color swatch and a `LEG ·` meta line.
  - Note matches never float alone — they are always context under their parent ride row.
- The `.search-count` rides-line is **replaced** by the section counts (fixes the "counts rides, not matches" bug by construction).

### 3.3 Ride & leg rows — index entries, not boxes

**Ride row** (RIDES section):

```
 [thumb 48]  Manali → Kaza                ← 14px typewriter BOLD, 1-line truncate
             RIDE · 12–18 AUG 2026 · 486 KM  ← mech 10px uppercase, tabular-nums, muted
```

- Full row = one tap target, min-height 44px. Separated from the next row by a 1px dashed hairline (the index rule), not a border.
- Thumb: keep the 48×48 photo-index square (`styles.css:1388–1396` has correct explicit dimensions) — add `loading="lazy"`. It's ride identity.
- Title: **14px bold typewriter**, `white-space: nowrap; text-overflow: ellipsis` (needs `min-width: 0` on the flex body — already present at `:1409`).
- Meta: the existing mechanical-uppercase treatment, plus `font-variant-numeric: tabular-nums` so "486 KM" and dates align.
- Hover/active: `background: var(--color-paper-dim)` wash + a 2px green left rule slides in; active state presses (translate 1px). No lift shadow — that physicality belongs to shelf cards, not index rows.
- Fallback (if the team prefers card consistency over index hierarchy): keep the bordered mini-card but upgrade to the timeline-card language — 2px 2px 0px shadow, hover lift (`styles.css:2755–2762`), bold title. **Recommended: index rows.**

**Leg row** (LEGS section):

```
 ●  Jispa → Sarchu          LEG · 13 AUG 2026 · 104 KM
    stop: “…Sarchu… 4710 m…”
```

- No thumbnail. Identity = the **day-color swatch** (`DAY_COLORS` — already computed per date in `ride-detail.tsx:524`) + date meta. The swatch ties the search hit back to the ride timeline's day-group — a free system tie-in that costs one prop plumbed through `buildSearchResults`.
- Same 44px index-row anatomy, dashed hairlines, green left rule on hover.

### 3.4 Context — margin notes with a visible match

The snippet becomes a **margin note**: indented under its row, 1px **dashed** left rule (it's an annotation — dash, not the solid 2px `tint-2` at `styles.css:1433`), label **inline** on the same line instead of stacked above:

```
 stop: “…the pass was closed at dusk…”
```

- Label: mech 8px uppercase, ink-muted, inline prefix + `·`, e.g. `stop:` / `note:` / `ride:`. One line, not two.
- Text: 12px typewriter, line-height 1.4, `-webkit-line-clamp: 2` (with `min-width: 0`), the matched term rendered by `.search-hit`.
- **The hit mark flips to inverse green** — `background: var(--color-green); color: var(--color-paper)` — the app's own `::selection` language (`styles.css:41–44`). It is the only saturated element in the index and it holds in all 7 themes because it's token-driven. This is a two-line CSS change with the single biggest perceptual payoff.
- Max 2 margin notes per row (keep the existing `add` cap), deduped (Phase 0 fix).

### 3.5 The suggestion panel

```
 ⌕ manali
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─            ← dashed top hairline separates panel from field
 ▸ Manali → Kaza               RIDE     ← 13px typewriter; predictive tail in green
   Manali → Spiti              RIDE
   stop: Manali               HIMACHAL
```

- Panel sits directly under the field, dashed top hairline (the ruled-line continuity). Capped 4–8 rows (Baymard), each **44px**, no internal scrollbar.
- Row anatomy: entity name (13px typewriter, truncate) + **scope tag** (mech 8px uppercase muted — `RIDE` / `LEG` / country) right-aligned, styled distinctly from the query text (the "scope ≠ query" rule).
- Active/selected row: paper-dim wash + green left rule + the predictive portion rendered in `--color-green`. Focus stays in the input (`aria-activedescendant`).
- Visual difference from results is deliberate: suggestions are a **panel** (separated by hairline), results are an **index** (separated by per-row hairlines).

### 3.6 Pre-search state — the journal page

```
 RECENT SEARCHES                      CLEAR ALL
   manali pass
   himachal legs
 SUGGESTED
   Manali → Kaza · Jispa · Sarchu
 YOUR LOG · 14 RIDES
```

- "RECENT SEARCHES" section: index rows of the last queries (dashed hairlines), each a tap target that re-runs the query; "CLEAR ALL" as a mechanical-uppercase margin action on the header line (44px).
- "SUGGESTED": 2–3 **derived** example searches (recently-logged ride names or popular stop names), as underlined inline links — derived, not static copy.
- Marginalia line at the bottom: `YOUR LOG · 14 RIDES` (mech 10px muted, tabular-nums). Gives the "what's searchable" answer the old dead-end line never did.
- Never a bare centered "Type to search…" line.

### 3.7 No-results state — the paper stub

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  NO MATCHES FOR “manali pass”       │
│                                     │
│  Try “Manali” · Browse all rides →  │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

- A dashed-border, 4px-radius "stub" (dash = annotation, per the design language), 24px padding, centered.
- Copy is second-person, states the fix not just the problem (guidelines): "No matches for **“manali pass”**." → "Try **“Manali”**, or browse all rides →". Recovery ladder from the function plan (tolerant match suggestion → browse all → recents).
- Curly quotes, `…`/`·` characters only, tabular numerals.

### 3.8 Loading state — skeleton index

- Initial book load only (local search itself is <100 ms — no spinner for keystrokes): 3 skeleton rows matching the index anatomy — 48×48 paper-dim block, a 60%-width title block, a 40%-width meta block — separated by the same dashed hairlines, with a slow opacity pulse.
- No layout shift: skeletons occupy the exact row geometry.

### 3.9 Motion & reduced motion

- Sheet slide-up: unchanged (already correct).
- Section headers: reveal with `translateY(8px)` + `opacity`, 150 ms, 30 ms stagger, transform/opacity only (compositor-friendly).
- Rows: hover wash + green rule transition at 150 ms; never `transition: all` — list the exact properties.
- **`@media (prefers-reduced-motion: reduce)`**: kill all search transitions/animations (headers appear instantly, skeleton pulse becomes a static dim block). The app has no global reduced-motion block today — this pass adds the search-scoped one (flag an app-wide pass separately).

### 3.10 Touch, copy & accessibility polish (guideline checklist, mapped)

- `touch-action: manipulation` on all rows and suggestion items; `overscroll-behavior: contain` on `.search-sheet`; `-webkit-tap-highlight-color` already transparent globally — keep tactile `:active` states.
- Icon buttons (`close`, `clear`, magnifier) get `aria-label`; input is labeled (kicker + `aria-label`); combobox ARIA per the function plan (APG pattern).
- `aria-live="polite"` on the section-count header only (not per-row — avoids screen-reader spam per keystroke).
- Tabular-nums on every numeric column (meta, counts, log count).
- Copy standards: second person, active voice, numerals ("14 rides"), `&` → "and" is fine at rest but "&" when space-constrained (headers), `…` in placeholders, curly quotes.
- Focus: green `:focus-visible` ring (already global at `styles.css:1511–1514`); active suggestion visible; focus trap on the sheet.

### 3.11 Theme-proofing rule

Every new declaration uses **tokens only** (the 7 themes re-map all of them). Critical contrast reads (mark, wash, rules) must be re-checked in cyberpunk (neon green `#00ffcc` on `#0a0a0f` — the inverse mark becomes a neon chip; acceptable, but verify) and midnight. No raw hex in new CSS.

---

## 4. Design decisions that change the engineering plan

| # | UI decision | Engineering impact | Phase |
|---|-------------|--------------------|-------|
| D1 | Ledger-line field (kicker, leading icon, clear ×, green ring) | Rebuild input row JSX; clear-button state; fix `.search-input:focus`; new CSS | 0 (ring fix) · 2 (clear + enterkeyhint) |
| D2 | Sectioned catalog RIDES/LEGS with counts | `buildSearchResults` returns grouped structure; new `SearchSectionHeader`; count semantics change; remove `.search-count` | 3 |
| D3 | Index rows (dashed hairlines, 44px, no borders) | Replace `.search-result-main` styling; row JSX restructure; drop 24px result gap | 3 |
| D4 | Inverse-green hit mark | One CSS swap on `.search-hit` | 0 |
| D5 | Margin-note snippets (inline labels, clamp 2) | Snippet JSX restructure; dedupe (already P0) | 0 (dedupe) · 3 (visual) |
| D6 | Day-color swatch on leg rows | Plumb `DAY_COLORS` index into search results; leg rows drop thumbs | 3 |
| D7 | Pre-search journal (recents + suggested + CLEAR ALL + log count) | Extends P1 recents work with derived suggestions + marginalia | 1 |
| D8 | No-results stub + recovery copy | Stub CSS + copy; tolerant matching (already P3) | 3 |
| D9 | Skeleton index | Initial-load skeleton rows | 0 (no-flash) · 3 (visual) |
| D10 | Suggestion panel visual language | P2 styling addition | 2 |
| D11 | Motion + reduced-motion block | Transition property lists; `prefers-reduced-motion` media block | 4 |
| D12 | Touch polish (touch-action, overscroll, 44px, aria-live) | CSS + attribute sweep | 4 |
| D13 | tabular-nums, `…`, curly quotes, copy standards | Sweep across all new copy | 0–3 (as written) |
| D14 | Thumb `loading="lazy"` | One attribute | 0 |
| D15 | URL-synced query (optional, deferred) | Query into hash (`#/search?q=…`) for deep-linkable, shareable search; supersedes session-only restore | deferred |

Net effect on the engineering plan: Phase 3 grows from "results + empty states" into **"the catalog"** (grouping, index rows, margin notes, stub state, swatches) — it becomes the visual heart of the work; Phases 0 and 2 absorb the small high-payoff swaps (green mark, focus ring, lazy thumbs, field restructure).

---

## 5. Open design questions (need a call before Phase 2–3)

1. **Index rows vs. mini-cards.** Recommendation: index rows (borderless + hairlines) — search should read as an index, distinct from Home's shelf. If the team prefers consistency with timeline cards, the fallback spec (bordered, 2px shadow, hover lift) is ready. This decision gates D3.
2. **Autofocus on open.** Recommendation: keep (user-invoked search), with the keyboard-fold design constraint on State A. Flip only if the virtual keyboard covering recents bothers in testing.
3. **URL-synced query (D15).** Recommendation: defer — the session hook already restores query on Back; URL sync is a robustness upgrade, not a visual one. Revisit after Phase 4.

---

## Appendix — evidence map

| Decision | Evidence |
|----------|----------|
| Field anatomy (leading icon, clear ×, type=search, submit) | Baymard mobile-search-submit-button; Apple HIG; M3 Search; WIG forms section |
| Sections with counts | Smashing 2009 ("sub-headings when results span sections"); Apple HIG (categorize) |
| Index rows over cards | Design-system coherence (Home=shelf, search=index); WIG touch/interaction (44px, manipulation) |
| Inverse-green mark | App's own `::selection` (`styles.css:41–44`); WCAG 1.4.3 (paper-dim mark fails 4.5:1 in light themes) |
| Margin-note snippets, inline labels | Baymard snippets (why-they-matched); reduces label noise (current 8px stacked label) |
| Day-color swatch on legs | System reuse: `DAY_COLORS` already in `ride-detail.tsx:524` |
| Pre-search recents + suggested | Apple HIG (recents before search); Baymard persist-queries |
| No-results stub with fix | Baymard no-results-page; WIG content ("errors include fix/next step") |
| Reduced-motion | WIG animation (prefers-reduced-motion); NN/g perceptual budgets |
| tabular-nums, `…`, quotes, numerals | WIG typography/content sections |
| Skeleton geometry = row geometry | NN/g Response Times (no flash of empty→full) |
