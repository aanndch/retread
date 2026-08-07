# Retread

## Design language
Paper field-logbook: paper `#f4efe6`, ink `#2b2926`, green accent `#4a5d4e`, Space Mono + JetBrains Mono, 4px sharp radii, dashed hairlines, hard offset shadows (`2px 2px 0`). PageHeader on every page (back at 12px inset, 43px slim bar, 36px icon, sticky with paper-fill overhang). Page titles in the body, never the top bar. No error/empty flashes during route transitions. Mobile-first: max-width 480px card, test at 390×844 (primary) and 412×915 (Pixel 9 Pro).

## Navigation architecture
URL-reflects-state. Overlays that navigate away (search, settings) are real routes. Modals that stay on their host page (map, photo, arrange) are `?modal=` query params. Transient dialogs (confirm, info, map picker) are plain component state. Context-aware back: a single variable (`prevInAppHashRef`) → `history.back()` when an in-app predecessor exists, else `location.replace(logicalParent)`. Never same-URL `pushState` entries.

## Motion
Single-source tokens in `:root`: `--motion-fast: 150ms; --motion-base: 220ms; --motion-slow: 300ms; --motion-route: 180ms`. One exit-fade hook (`useExitFade`, default 220ms), honored by `prefers-reduced-motion` via `matchMedia`. One global reduced-motion gate (the `*` block at ~3811). Ref-counted body scroll lock. Focus trap + restore (`useOverlayFocus`) on every overlay.

## Sticky / scroll rules
Chrome measures sticky offsets from the scroll container's padding edge. Use `padding-top: 0` on the scroll container and let the sticky threshold create the inset. Sticky elements get a paper-fill overhang (`box-shadow: 0 calc(-1 * gap) 0 0 var(--color-paper)`) so nothing bleeds through when scrolled.

## Engineering lessons (learned the hard way)

- **Verify before patching.** When a fix doesn't solve it, don't stack another hypothesis — find a discriminating signal (one case works, another fails) to isolate the variable first. Symptom-fixes on an unverified cause is how a bug survives multiple attempts.
- **Headless pass ≠ real device.** Geometry/timing bugs live at size/timing boundaries your fixtures may not cover (a note taller than the viewport broke a reach-check that all-short fixtures never exercised). Seed diverse data: long content, tall elements, far targets.
- **Pure predicates deserve tests.** `isInView` (a one-line geometry check) went unfixed for four cycles because it was untested. Extract scroll/focus/layout checks into small testable functions.
- **One owner per shared resource.** Scroll (and scroll-lock, focus) must have a single controller. Two systems racing a resource is an architectural smell — consolidate ownership.
- **Coordinate side-effects with the route lifecycle.** Content-gated pages stay invisible (`.preparing`) through the reveal; any post-arrival effect (deep-link scroll, focus) must wait for the reveal to complete, or it races the transition.
- **`scrollIntoView` geometry:** `block:'center'` on an element taller than the viewport forces its top negative — a `top >= 0` "reached" check is unsatisfiable. Use overlap-aware checks (`top < vh && bottom > 0`).
- **Temporary inline highlights:** never add `padding`/`font-weight` (footprint → reflow, text moves) and never fade `opacity` (text vanishes). Use `background-color` + `color` and cross-fade those. Deep-link scroll should land below pinned chrome (`scroll-margin-top`) and the flash must appear after the scroll settles so it's visible on arrival.

## Verification
`npm run build` after every change. **No browser/headless verification scripts unless the user explicitly asks** — build always, browser sessions only on request. Chrome DevTools MCP for browser testing when asked (slim, headless, 390×844 viewport).
