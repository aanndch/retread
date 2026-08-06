---
name: mobile-search-ux
description: Use when designing, redesigning, or reviewing a search feature, search page, search overlay, search input, or autocomplete — especially mobile-first or single-column layouts. Triggers: search UX questions, autocomplete or suggestions, recent searches, no-results and empty states, filter chips, debounce, combobox ARIA, search accessibility, search result cards, keyboard/touch ergonomics for search.
---

# Mobile Search UX

## Overview

Search UX succeeds when users find what they need in as few taps as possible, understand **why** each result matched, and are never stranded in a dead-end state. Guidance here is grounded in Nielsen Norman Group, Baymard Institute, Apple HIG, Google Material Design 3, WAI-ARIA APG, WCAG 2.2, and Smashing Magazine.

Core principle: **the search field is always visible, every empty state recovers, and nothing the user typed or found is ever silently lost.**

## When to Use

- Designing or redesigning a search page / overlay / field — new build or rework.
- Reviewing an existing search UX against current best practice.
- Implementing autocomplete/suggestions, recent searches, no-results states, filter chips, or result grouping.
- Accessibility pass on a search field (combobox ARIA, keyboard contract, touch targets).
- Choosing debounce, matching/ranking, or sort behavior for a search feature.

Do NOT use for: general form design, navigation/information-architecture questions unrelated to search, or analytics of search logs.

## Quick Reference — Top 10 highest-impact decisions

| # | Decision | Rationale (source) |
|---|----------|--------------------|
| 1 | Search field always visible at top: leading magnifier, `type="search"`, trailing clear (×) when text exists, explicit submit affordance | Baymard: 35% hide the field, 21% lack submit — both measurably hurt; Apple/M3 anatomy |
| 2 | Search-as-you-type with no perceptible delay (0.1 s / 1 s perceptual budget) | NN/g Response Times |
| 3 | Capped (≤8) suggestion list built only from real entities that yield results | Baymard choice paralysis; NN/g: suggested = endorsed |
| 4 | Pre-search state shows persisted recent searches (+ curated examples), one-tap clear | Apple HIG; Baymard persist-queries |
| 5 | Result cards state why they matched (term highlighted in context) + 2–3 metadata lines | Baymard snippets; Smashing 2009 |
| 6 | No-results state recovers: tolerant matching, alternatives with previews, browse-all, recents | Baymard no-results research |
| 7 | Dismiss keyboard on selection/submit; restore query + scroll on back-navigation | Baymard persist-queries; mobile ergonomics |
| 8 | Correct combobox ARIA: `combobox` + `aria-expanded` + `aria-controls` + `aria-activedescendant` listbox | WAI-ARIA APG Combobox pattern |
| 9 | 44px touch targets and ≥4.5:1 contrast (WCAG 2.2 floor is 24px) | Apple 44px; WCAG 2.2 |
| 10 | Filters/sort minimal, in place, after results — relevance default, never resets query/scroll | Apple HIG; Smashing 2009 |

## Full guide

**REQUIRED READING for any real redesign:** `mobile-search-ux-guide.md` — the complete detailed reference (7 sections + anti-pattern table + disagreement notes + all source URLs). Use it before making decisions, not after.

## Common Mistakes

- Hiding the field behind a magnifier icon (users mistake the icon for submit).
- Zero debounce → per-keystroke full rescan, stale-result flashes, listbox flicker.
- Clearing the input on blur or dropping the query on back-navigation (37% of sites fail to persist).
- Results that don't show why they matched (96% of sites get snippets wrong).
- Bare "no results" messages / "check spelling" tips alone (~50% of no-results pages are done poorly).
- Suggesting queries that return zero results.
- Over-stuffed suggestion lists with internal scrollbars (>8 items).
- No submit affordance near the field on mobile (keyboard-only submission is not intuitive).
- Filters/sort that reload the page or reset the query.

## Sources

Full URLs in `mobile-search-ux-guide.md`. Key ones: nngroup.com (Site Search Suggestions; Response Times), baymard.com (autocomplete, no-results, mobile submit button, persist queries), developer.apple.com HIG search fields, m3.material.io search, w3.org WAI-ARIA APG combobox, WCAG 2.2 SC 2.5.8, smashingmagazine.com search results design.
