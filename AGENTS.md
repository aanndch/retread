# Retread

## Design language
Paper field-logbook: paper `#f4efe6`, ink `#2b2926`, green accent `#4a5d4e`, Space Mono + JetBrains Mono, 4px sharp radii, dashed hairlines, hard offset shadows (`2px 2px 0`). PageHeader on every page (back at 12px inset, 43px slim bar, 36px icon, sticky with paper-fill overhang). Page titles in the body, never the top bar. No error/empty flashes during route transitions. Mobile-first: max-width 480px card, test at 390×844 (primary) and 412×915 (Pixel 9 Pro).

## Navigation architecture
URL-reflects-state. Overlays that navigate away (search, settings) are real routes. Modals that stay on their host page (map, photo, arrange) are `?modal=` query params. Transient dialogs (confirm, info, map picker) are plain component state. Context-aware back: a single variable (`prevInAppHashRef`) → `history.back()` when an in-app predecessor exists, else `location.replace(logicalParent)`. Never same-URL `pushState` entries.

## Motion
Single-source tokens in `:root`: `--motion-fast: 150ms; --motion-base: 220ms; --motion-slow: 300ms; --motion-route: 180ms`. One exit-fade hook (`useExitFade`, default 220ms), honored by `prefers-reduced-motion` via `matchMedia`. One global reduced-motion gate (the `*` block at ~3811). Ref-counted body scroll lock. Focus trap + restore (`useOverlayFocus`) on every overlay.

## Sticky / scroll rules
Chrome measures sticky offsets from the scroll container's padding edge. Use `padding-top: 0` on the scroll container and let the sticky threshold create the inset. Sticky elements get a paper-fill overhang (`box-shadow: 0 calc(-1 * gap) 0 0 var(--color-paper)`) so nothing bleeds through when scrolled.

## Verification
`npm run build` after every change. Chrome DevTools MCP for browser testing (slim, headless, 390×844 viewport). No puppeteer/headless sessions without explicit approval.
