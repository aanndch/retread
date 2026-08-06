# Mobile-First Search UX — Full Detailed Guide

Reference document for designing, redesigning, or reviewing search features (pages, overlays, fields, autocomplete). Context throughout: a single-column mobile layout (~390px), searching a personal, local dataset, results that deep-link to detail pages. Research basis: Nielsen Norman Group, Baymard Institute, Apple Human Interface Guidelines, Google Material Design 3, Smashing Magazine, WAI-ARIA Authoring Practices Guide (APG), WCAG 2.2.

---

## 1. Search input behavior

- **Keep the search field permanently visible and prominent.** Hiding it behind a magnifier icon degrades submission — 35% of mobile e-commerce sites hide the field and users then misinterpret the magnifier as the submit button (Baymard). Material Design 3: a search app bar is "an emphasized, global entry-point": leading search icon, hinted search text, optional trailing icons.
- **Search-as-you-type is endorsed, not optional, where feasible.** Apple: "If possible, start search immediately when a person types… provides results that are continuously refined as the text becomes more specific."
- **Always provide an explicit submit path** even with as-you-type — it is the safety net for iterative refinement (Baymard: 21% of mobile sites lack an adjacent submit button and it measurably hurts).
- **Clear (×) button:** include it, trailing inside the field, **visible only when there is text**. Caveat: Baymard observed users nearly tapping the clear icon as a submit button when no submit affordance existed — clear must be visually distinct from submit and positioned away from it.
- **Debounce timing:** there is **no authoritative UX figure for milliseconds**. The governing constraint is perceptual response time: 0.1 s feels instantaneous; up to 1.0 s keeps "flow of thought" uninterrupted; >1 s needs explicit busy feedback (Jakob Nielsen, NN/g "Response Times: The 3 Important Limits"). Common engineering convention: **200–400 ms trailing debounce** for as-you-type. For fast local in-memory search, run per keystroke and only debounce expensive work — never debounce into perceived sluggishness, and never show stale results for a newer query.
- **Suggestions/autocomplete:**
  - Cap the list: **4–8 suggestions on mobile** (choice paralysis past ~8; desktop ~10). Users mostly pick from the first few (Baymard).
  - **Never suggest a query that returns zero or irrelevant results** — users treat a system-suggested term as implicitly vetted and are "downright irritated" when it fails (NN/g).
  - **Visually distinguish the typed portion from the suggested portion** — highlight the predictive/unique part, not the repeated typed chars, so users scan the differences (Baymard; NN/g).
  - **Copy the active suggestion into the field when it receives keyboard focus** (58% of sites don't) — users then "continue" the suggestion with extra words before submitting (Baymard).
  - **When suggestions appear:** Apple shows recent searches *before* search begins and predictive suggestions *as* a person types; the APG notes popup-trigger conditions are implementation-defined (on focus even when empty; on Down Arrow; or after N typed characters). A minimum of ~2–3 typed characters for predictive suggestions is common practice (folklore — flagged below), with empty-query showing recents/popular instead.
  - **Don't make suggestions visually noisy:** no scrollbars inside the list, minimal decoration, dim/contain the background so nothing competes (Baymard).
  - Autocomplete is worth it even if rarely tapped: NN/g measured suggestion selection at only 23% of offered instances, yet users still used the list as a spelling/scoping reference — and its absence reads as "this item isn't offered."
- **Voice search:** optional. Apple's system search field ships a dictation affordance; M3 does not prescribe one. No strong evidence either way (flagged thin).

---

## 2. Recent searches & popular searches

- **Show recent searches before the user types anything** (empty-query pre-search state). Apple explicitly names "recent searches before search begins" as a suggestion strategy. The APG's "no autocomplete" combobox variant — popup shows recently entered values regardless of typed chars — is the exact accessible pattern for this.
- **Persist the query, don't discard it.** 37% of e-commerce sites fail to persist users' search queries (losing the query on navigation back or page refresh) — a named Baymard guideline. This matters doubly when results deep-link to detail pages: coming back must not wipe the query or scroll position.
- **Storage:** local-first (localStorage or the app's IndexedDB/Dexie layer) is appropriate for personal data. No authoritative TTL is prescribed anywhere (flagged thin) — practical convention: cap the list at ~5–10 entries, most-recent-first, dedupe, and let the user clear all with one tap; a hard expiry (e.g., 30 days) is optional, not evidence-based.
- **Quick-clear:** a single "Clear" affordance for the whole list (not only per-item ×) is the common pattern.
- **When recent searches are worth it:** they cut interaction cost and recover the user's own vocabulary. In a personal archive they are *high value* because the user re-finds the same items repeatedly. "Popular searches" is only meaningful with aggregate audience data — for a single-user archive show *recent* first, plus a curated set of example searches, not "popular."
- **Handle misspellings and near-matches in suggestions** — 69% of sites don't offer relevant autocomplete for closely misspelled terms, and misspellings are a top cause of zero-result searches (Baymard).

---

## 3. Filtering & sorting

- **Default to the broadest scope and let users refine** — Apple: "Default to a broader scope and let people refine it as they need," via a scope bar that "filters among clearly defined categories" and can appear before or after the query; results-first simplification is preferred.
- **Show filters after results on mobile, but keep them one tap away.** Baymard: **46% of sites get "autodirect or guide users to matching category scopes" wrong** — when a query clearly matches a scope (e.g., a country), either offer the scope as a suggestion or show it as a filter chip; don't silently search everything.
- **Scope ≠ query text:** if you offer scoped suggestions, style the scope differently (indent, italic, muted color) so users can tell it apart from the query itself (Baymard; NN/g).
- **Filter chips** for discrete facets are the standard mobile pattern; M3's search-view spec places suggestions/results in a list below the bar where chips can live. Sort controls on mobile should be a compact affordance that re-sorts **in place** — Ajax-driven, not a page reload (Smashing 2009).
- **Before vs. after querying:** when facets are few (e.g., type, country), render them as chips *after* a query has results (Apple's refine-after pattern); only surface pre-query scoping if the dataset is large enough that a wrong guess would waste the user's time. Scoped search "should only be used… if it can be implemented well" (NN/g).
- **Sorting:** relevance (best match first) must be the default — Apple: "Provide the most relevant search results first to minimize the need for someone to scroll." Add date/distance/name sort only if users will plausibly use them.

---

## 4. Result presentation

- **Card anatomy for a search result:** a large tappable title (the matched name), the **matched fields made explicit** (why this result), and 2–3 key metadata lines (date, distance/location, country) scannable at a glance. Durable principles (Smashing 2009 survey): titles "large, bold, and hyperlinked," search terms highlighted in context within a snippet, results grouped under section headings when they span categories, visited links indicated.
- **Grouping/headers:** if results span categories (e.g., ride vs. leg, or country), group under headers with counts — Smashing: "If results span different sections… indicate this by sub-headings." Apple: "consider categorizing them."
- **How many results:** for the *suggestion* list the cap is 4–8 mobile (Baymard). For the results *page* there is no authoritative count (flagged thin). For a personal archive, showing all matches in a scrollable list is fine; if lists can be long, prefer load-more/infinite scroll over pagination on mobile (Smashing).
- **No-results empty state — never a dead end.** ~50% of no-results pages are implemented poorly and it drives abandonment. Proven recovery strategies (Baymard): (1) related categories/items, (2) alternative search suggestions — ideally with a 3–5 item preview per alternative; if exactly one alternative exists, apply it automatically with a notice — (3) personalized/recent recommendations, (4) help/contact links, (5) popular items. **Search tips alone ("check spelling") are not enough** — users rarely read or act on them.
- **Pre-search empty state:** this is the surface for recents/popular/example searches (Apple endorses this explicitly). Don't leave it blank.
- **Loading/skeleton states:** respect the perceptual limits — if a local search resolves <100 ms, no spinner needed at all; for anything slower, show a skeleton that matches the result-card shape (layout stability, no flash of empty→full). NN/g: no feedback needed <0.1 s; user notices 0.2–1.0 s but flow is fine; >1 s needs explicit busy feedback.
- **Error states:** distinguish "no matches" (user recoverable → recovery affordances) from "search failed" (transient/system → retry + preserved query). The latter should never clear the user's query.

---

## 5. Mobile ergonomics & keyboard

- **Provide an explicit submit button adjacent to the search field — 21% of mobile sites don't and it measurably hurts.** Users instinctively reach to the right of the field to submit; without a button they pause, scan, and risk tapping Clear instead. Bites hardest during iterative refinement.
- **Never hide the search field behind an icon-only entry** (35% of mobile sites do; 68% use a magnifier icon, which users misinterpret as submit).
- **Customize the keyboard submit key.** `type="search"` yields a labeled "Search"/magnifier key on iOS; 17% of sites leave the default gray "return," which reads wrong.
- **Keyboard dismissal on selection:** selecting a suggestion or submitting should dismiss the keyboard when it navigates to results — a field that keeps the keyboard up wastes half the screen. Baymard's submission model: (1) adjacent UI button, (2) keyboard search key, (3) autocomplete selection — support all three, and all three imply the keyboard closes on action.
- **Enter-to-search:** the keyboard's Search key must submit; ArrowUp/Down navigate suggestions, Enter commits the focused suggestion, Escape closes the list (WAI-ARIA APG Combobox).
- **Focus on entry / autofocus:** Apple recommends immediately focusing the field on a dedicated search area — with the explicit exception of iPad-with-virtual-keyboard where it would cover content. On phone-sized layouts, autofocus is the expected pattern *provided* it doesn't obscure an informative pre-search state.
- **Search icon placement:** leading magnifier inside the field (M3 anatomy); trailing slot reserved for clear (and submit, if used) — never put the magnifier trailing where users expect a submit target.
- **Voice:** optional dictation affordance per Apple; no strong evidence either way (flagged thin).

**Note on source disagreement:** Apple's system pattern leans on the keyboard Search key (its HIG field has no mandated adjacent submit button), while Baymard's mobile testing says the adjacent button is required — implement *both* to satisfy both.

---

## 6. Accessibility (WAI-ARIA APG Combobox Pattern unless noted)

- **Label the input** via a visible `<label>` (or `aria-labelledby`, else `aria-label` if the field carries an icon + placeholder and label text is truly absent).
- **Combobox semantics for a search-with-suggestions field:**
  - input: `role="combobox"`, `aria-expanded="true|false"` (only `true` while the popup is shown), `aria-controls` referencing the popup listbox, `aria-autocomplete="list"` (values appear as you type) or `"none"` (recent-searches list that doesn't respond to typing).
  - popup: `role="listbox"`; each item `role="option"` with `aria-selected` on the active one.
  - **Focus stays in the input while the user arrows through options** — the active option is conveyed via `aria-activedescendant`, never by moving DOM focus into the list.
  - Keyboard: Down/Up move through options, Enter accepts the focused option, Escape closes the popup (and optionally clears), printable chars type into the input. **Don't capture keys needed for text editing.**
- **Debounce + assistive tech:** delayed results must not cause the listbox to flicker open/closed between keystrokes — expand only when there are results to show, keep `aria-expanded` in sync; consider suppressing announcements of stale lists (no authoritative APG rule — flagged thin).
- **Touch target sizes:**
  - **WCAG 2.2 AA minimum: 24×24 CSS px** per target, or sufficient spacing so a 24px-diameter circle around each undersized target doesn't intersect neighbors (plus named exceptions). This is the floor, not the goal.
  - **Practical mobile target: ~44px** (Apple's documented guidance). Baymard independently found small fonts + tight spacing in suggestion lists cause mistaps and accidental navigation — ensure suitable spacing, hit areas of an appropriate size, and appropriately large fonts.
- **Contrast:** normal text needs ≥4.5:1 (WCAG 1.4.3). Muted/italic scope text must still clear this bar.
- **Focus visible** (WCAG 2.4.7): highlight the active suggestion with a clear background state — Baymard observed hesitation and wrong picks when active suggestions weren't visibly highlighted.
- **`type="search"`** gives native semantics (role searchbox, one-tap clear on some platforms) and the labeled Search key.

---

## 7. Common anti-patterns

| Anti-pattern | Why it's harmful | Do instead |
|---|---|---|
| Hiding the search box behind an icon | Users mistake the magnifier for submit; submission becomes a hunt; 35% of mobile sites pay for it | Always-visible field on the search page |
| Zero debounce / thrash | Results churn per keystroke; listbox flickers; stale results flash | Local search per keystroke; debounce only expensive work (200–400 ms convention); never show stale results |
| Clearing input on blur / losing the query on navigation | User loses work; back-navigation resets everything; 37% of sites drop queries | Persist query text and scroll; restore on return |
| Results that don't show why they matched | Users can't judge relevance; must open cards blindly; 96% of sites get contextual snippets wrong | Show matched fields/snippets with the term highlighted in context on the card |
| Dead-end empty states | ~50% of no-results pages strand users; "check spelling" tips are ignored | Recovery paths: alternative searches with previews, related items, recents/popular, never a bare message |
| Suggesting queries that return nothing | System-suggested = implicitly endorsed; failure reads as site failure | Only suggest real entities/queries that yield results |
| Over-stuffed suggestions (scrollbars, 15+ rows) on mobile | Choice paralysis; suggestions hidden behind keyboard | 4–8 suggestions, no internal scroll, clear visual priority |
| No submit affordance near the field | Keyboard-only submission is not intuitive on mobile; near-taps on Clear | Adjacent submit button + labeled keyboard Search key + suggestion selection |
| Filter/sort that reloads or hides state | Losing query or scroll on refine breaks the loop | In-place, Ajax-driven sort; scope chips that keep the query |

---

## 8. Top 10 highest-impact design decisions (mobile search)

1. **Search field always visible at the top** — leading magnifier, `type="search"`, trailing clear (×) only when text exists, explicit adjacent submit button (Baymard's strongest mobile finding; Apple/M3 anatomy).
2. **Search-as-you-type with no perceptible delay**, tuned to the 0.1 s/1 s perceptual budget — never sluggish, never stale.
3. **A capped (≤8), clean suggestion list built only from real entities** — predictive portion highlighted, scope styled distinctly, active item visibly highlighted, no internal scrolling.
4. **A pre-search state showing recent searches** (persisted, capped ~6–10, deduped, one-tap clear) plus a couple of curated example searches.
5. **Results as scannable cards that state why they matched** — name (large, tappable), matched field with the term highlighted in context, date/distance/location metadata; group categories under headers with counts.
6. **A no-results state that recovers** — tolerant matching + alternative-search suggestions with item previews, then browse-all and recent items; never a bare message.
7. **Dismiss the keyboard on selection/submit and restore full search state on back-navigation** from detail pages.
8. **Correct combobox accessibility** — `combobox` + `aria-expanded` + `aria-controls` + `aria-activedescendant` listbox options, Arrow/Enter/Escape keyboard contract, labeled input, visible focus (APG verbatim).
9. **44px touch targets and ≥4.5:1 contrast everywhere** (WCAG 2.2 24px floor, Apple 44px target) — suggestion rows especially.
10. **Keep filters/sort minimal and in place** — country/type chips after results (broadest scope by default), relevance default sort, refinement that never resets the query or scroll.

---

## 9. Where sources disagree / guidance is thin

- **Debounce milliseconds:** no authoritative UX source prescribes a number; NN/g gives perceptual thresholds (0.1/1/10 s); 200–400 ms is engineering convention. **Thin.**
- **Adjacent submit button:** Baymard requires it on mobile; Apple's system pattern centers on the keyboard Search key. Implement both. **Disagreement in emphasis.**
- **Minimum characters before suggestions appear:** APG leaves trigger conditions implementation-defined; ~2–3 chars is convention. **Thin.**
- **Autofocus on entry:** Apple endorses (with a virtual-keyboard caveat for iPad); beware keyboard covering the pre-search state. **Thin beyond Apple.**
- **Recent-search TTL:** none prescribed; cap-and-clear is convention. **Thin.**
- **Results-per-page / list length:** no authoritative number; ~10/page is desktop convention, mobile favors continuous scroll. **Thin.**
- **Voice search:** optional per Apple; no evidence base on standalone voice buttons. **Thin.**
- **Smashing Magazine's search coverage is dated** (2008–2009 core articles; one 2022 implementation piece) — its durable principles (term-highlighted snippets, section headings, Ajax-driven sort) remain valid; treat as corroboration, not primary mobile guidance.
- **M3 details** (search-view states, debounce notes) are partially paywalled/client-rendered; only the overview is captured here.
- **M3 vs Apple styling:** M3 and Apple HIG agree on core anatomy (leading icon, hint text, clear button) but disagree on "contained vs. outlined/plain" field styling — an aesthetic, not behavioral, divergence.

---

## Sources

- Nielsen Norman Group — "Site Search Suggestions" (2018): https://www.nngroup.com/articles/site-search-suggestions/
- Nielsen Norman Group — "Response Times: The 3 Important Limits" (1993/2014): https://www.nngroup.com/articles/response-times-3-important-limits/
- Nielsen Norman Group — Search topic index: https://www.nngroup.com/topic/search/
- WAI-ARIA Authoring Practices Guide — Combobox Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- Apple HIG — Search fields: https://developer.apple.com/design/human-interface-guidelines/search-fields
- Google Material Design 3 — Search: https://m3.material.io/components/search/overview
- WCAG 2.2 — Understanding SC 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Baymard — "9 UX Best Practice Design Patterns for Autocomplete Suggestions" (2022): https://baymard.com/blog/autocomplete-design
- Baymard — "5 Proven UX Strategies for 'No Results' Pages" (2019/2025): https://baymard.com/blog/no-results-page
- Baymard — "Always Provide a Submit Button Adjacent to the Search Field on Mobile" (2021): https://baymard.com/blog/mobile-search-submit-button
- Baymard — On-Site Search article collection: https://baymard.com/blog/collections/on-site-search
- Baymard — "Always Copy the Active Autocomplete Suggestion to the Search Field" (2024): https://baymard.com/blog/copy-search-suggestion-to-search-field
- Smashing Magazine — "Search Results Design: Best Practices and Design Patterns" (2009): https://www.smashingmagazine.com/2009/09/search-results-design-best-practices-and-design-patterns/
- Smashing Magazine — Search category: https://www.smashingmagazine.com/category/search/
