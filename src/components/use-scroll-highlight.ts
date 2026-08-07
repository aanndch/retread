import { useEffect, useRef } from 'preact/hooks';
import { useRouteQuery } from './use-route-query';
import { normalize } from '../ui/search-match';

// Total flash lifespan (~1.2s): fade-in ~200ms, hold, fade-out ~400ms. The
// timings ride the --motion-fast/--motion-slow scale (a single JS-driven sweep,
// not covered by the CSS reduced-motion gate — see prefersReducedMotion below).
const FLASH_MS = 1200;

// Robust async-element wait: a MutationObserver (data-gated routes mount their
// content after the effect runs) with a generous safety timeout. Far more
// reliable than the old capped rAF poll, which could give up on a slow device
// before the element rendered → no scroll at all.
const WAIT_MS = 5000;
// Cap on how long we wait for the route to be fully revealed before starting
// the deep-link scroll (see waitForReveal below). Kept well above the longest
// realistic reveal (~600ms) so it acts purely as a hard safety backstop and
// never resolves the wait mid-reveal.
const REVEAL_WAIT_MS = 1500;
// Cap on how long we wait for a smooth scroll to settle before flashing, so a
// missing `scrollend` or a stubborn scroll never starves the flash. Kept above
// the longest realistic smooth scroll (~1.2s) so it acts as a hard cap and
// never resolves mid-flight — `scrollend` remains the normal settle path.
const SCROLL_SETTLE_MS = 1200;

// --- Self-correcting deep-link landing -------------------------------------
// A single scrollIntoView isn't enough on real devices: pages whose content
// (photos, map, cover image) loads AFTER mount push the target further down,
// so the first scroll lands short. The landing is now verify-and-rescroll:
// scroll to the target, wait for it to settle, then CHECK the target is
// actually on screen; if not, re-scroll — up to a few correction passes,
// giving late-loading layout a moment (waiting on the container's images to
// finish) before each retry. Capped so we never fight the layout forever —
// better to land close than to keep scrolling.
const MAX_SCROLL_PASSES = 3;
const PASS_DELAY_MS = 150;
const IMG_WAIT_MS = 800;

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Resolve a 0-based character index into { node, offset } within the target.
// normalize() (used for the match) is length-preserving, so the index maps 1:1
// back onto the original text offsets.
function findCharOffset(
  container: HTMLElement,
  charIndex: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null = null;
  let remaining = charIndex;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) return { node, offset: remaining };
    remaining -= len;
  }
  return null;
}

// Wrap the first occurrence of `term` (normalized match) in a temporary
// `<mark class="search-flash">`. Returns whether a mark was inserted. Degrades
// to no-op when the term isn't literally present or the range crosses an
// element boundary (surroundContents throws) — the caller scrolls only.
function flashTerm(container: HTMLElement, term: string): boolean {
  const normQ = normalize(term).trim();
  if (!normQ) return false;
  const idx = normalize(container.textContent ?? '').indexOf(normQ);
  if (idx === -1) return false;
  const start = findCharOffset(container, idx);
  const end = findCharOffset(container, idx + normQ.length);
  if (!start || !end) return false;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const mark = document.createElement('mark');
  mark.className = 'search-flash';
  try {
    range.surroundContents(mark);
  } catch {
    return false;
  }
  return true;
}

// Resolve once the target `id` exists in the DOM. Data-gated routes (ride/leg)
// mount their content asynchronously, so the element may not exist when the
// effect first runs — observe the document for mutations and give up after
// WAIT_MS. No leaked observer: it disconnects on resolve.
function waitForEl(id: string): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById(id);
    if (existing) return resolve(existing);
    let done = false;
    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.clearTimeout(safety);
      resolve(el);
    };
    const observer = new MutationObserver(() => {
      const el = document.getElementById(id);
      if (el) finish(el);
    });
    observer.observe(document, { childList: true, subtree: true });
    const safety = window.setTimeout(() => finish(document.getElementById(id)), WAIT_MS);
  });
}

// Resolve once the route is fully revealed — the incoming view has shed its
// `.preparing` class (or its computed opacity is ~1), meaning the content-gated
// route transition has faded it in. On NAVIGATION the App holds the incoming
// page invisible (opacity 0) for up to ~600ms of reveal while its data/photos
// load; starting the deep-link scroll during that window races the swap + the
// late-loading layout, so the self-correction can fall short. On REFRESH there
// is no transition, so the viewport is settled and revealed immediately. Gating
// on this signal makes the navigation path identical to refresh: the page is
// settled and visible before the scroll runs, so the scroll is the sole,
// post-settle controller. A rAF poll drives the check (re-reading `.viewport`
// each frame, so it survives the viewport being swapped/re-mounted mid-navigate),
// with a MutationObserver as a fast path for the class swap and a timeout safety
// so it never hangs if the reveal signal isn't detectable (no `.viewport` /
// non-gated view). No leaked observer/timers: all are torn down on resolve.
function waitForReveal(): Promise<void> {
  return new Promise((resolve) => {
    const viewport = () => document.querySelector('.viewport') as HTMLElement | null;
    const revealed = () => {
      const vp = viewport();
      // Revealed = the viewport no longer carries `.preparing` (the class the
      // App toggles to hold the route at opacity 0). Fall back to computed
      // opacity ~1 for robustness against a class rename / non-viewport shell.
      if (!vp) return true; // no signal to read — don't block
      if (!vp.classList.contains('preparing')) return true;
      return parseFloat(getComputedStyle(vp).opacity) >= 0.99;
    };
    if (revealed()) return resolve();
    let done = false;
    let raf = 0;
    const finish = () => {
      if (done) return;
      done = true;
      observer.disconnect();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      resolve();
    };
    const check = () => {
      if (revealed()) finish();
      else raf = window.requestAnimationFrame(check);
    };
    // Class swaps on `.viewport` are attribute mutations — observe them for a
    // faster settle than the rAF poll alone.
    const observer = new MutationObserver(() => {
      if (revealed()) finish();
    });
    const vp = viewport();
    if (vp) observer.observe(vp, { attributes: true, attributeFilter: ['class'] });
    raf = window.requestAnimationFrame(check);
    const safety = window.setTimeout(finish, REVEAL_WAIT_MS);
  });
}

// Resolve once scrolling has settled — the smooth scroll has arrived — so the
// flash is applied after the page lands and stays visible for its full span.
// Prefers the `scrollend` event (fires when the window/container stops
// scrolling), falls back to a debounced `scroll` listener, and always caps out
// so the flash never starves.
function waitForScrollSettle(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    let debounce = 0;
    const onScroll = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(finish, 120);
    };
    const onScrollEnd = () => finish();
    const scroller = document.scrollingElement || document.documentElement;
    const safety = window.setTimeout(finish, SCROLL_SETTLE_MS);
    const cleanup = () => {
      window.clearTimeout(debounce);
      window.clearTimeout(safety);
      window.removeEventListener('scroll', onScroll, true);
      scroller.removeEventListener('scrollend', onScrollEnd);
    };
    // Capture-phase `scroll` catches scrolls from any descendant container too.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    scroller.addEventListener('scrollend', onScrollEnd);
  });
}

// Is any part of the target on screen? block:'center' centers the element in
// the viewport, so for notes TALLER than the viewport the top edge sits
// negative and out of view — requiring `top >= 0` would make the landing check
// unsatisfiable and the self-correction loop would give up. Any overlap with
// the viewport counts as reached instead: short notes behave exactly as before
// (their top is on-screen when centered), and tall notes correctly register
// once centered.
function isInView(el: HTMLElement, viewportH: number): boolean {
  const r = el.getBoundingClientRect();
  return r.top < viewportH && r.bottom > 0;
}

// Wait for the target's container images to finish decoding so the next scroll
// sees the final layout. Photos are the main late-layout culprit on the leg
// page (the carousel sits directly above the note), so waiting on their load
// lets a correction pass land after the carousel reaches its real height.
// Returns once every image is complete or after IMG_WAIT_MS, whichever first.
async function waitForContainerImages(root: ParentNode): Promise<void> {
  const deadline = Date.now() + IMG_WAIT_MS;
  while (Date.now() < deadline) {
    const pending = Array.from(root.querySelectorAll('img')).filter((i) => !i.complete);
    if (pending.length === 0) return;
    await Promise.race([
      Promise.all(
        pending.map(
          (i) =>
            new Promise<void>((res) => {
              const done = () => res();
              i.addEventListener('load', done, { once: true });
              i.addEventListener('error', done, { once: true });
            })
        )
      ),
      new Promise((r) => setTimeout(r, 300)),
    ]);
  }
}

// Scroll the target into view and self-correct until it actually lands on
// screen. Uses block:'center' — far more robust to drift than 'start', because
// a slightly-off position still keeps the target visible (it centers the
// element in the viewport rather than pinning its top to a precise offset).
async function scrollAndLand(el: HTMLElement, behavior: ScrollBehavior): Promise<void> {
  const viewportH = (document.scrollingElement || document.documentElement).clientHeight;
  const container = el.closest('main') || document.body;
  // Layout stability before the FIRST scroll: a webfont swap (`white-space:
  // pre-wrap` reflows as the font loads) and late-loading images (photos/map/
  // cover) can change the target's position mid-flight, making the initial
  // scroll measure a provisional layout. Gate the first pass on both so the
  // landing is measured against the stable layout. (Reduced-motion 'auto'
  // scrolls are instant, but the wait is still a cheap correctness guard.)
  if (document.fonts?.ready) await document.fonts.ready;
  await waitForContainerImages(container);
  for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
    el.scrollIntoView({ behavior, block: 'center' });
    await waitForScrollSettle();
    if (isInView(el, viewportH)) return;
    // Late-loading layout (photos/map/cover) pushed the target down — wait for
    // the container's images to finish, then a brief settle delay, and retry.
    await waitForContainerImages(container);
    await new Promise((r) => setTimeout(r, PASS_DELAY_MS));
  }
}

// Deep-link scroll-to + flash-highlight. Reads `?scrollTo=<target>&q=<term>`
// from the route query (useRouteQuery) and, on mount / param change:
//   1. resolves the target element id from the `scrollTo` value via `resolveId`
//      (each page knows its own ids: leg → leg-note/leg-title, ride → ride-title),
//   2. waits (MutationObserver + safety timeout) for the element to mount,
//   3. scrolls it into view (block:'center', clear of pinned chrome via
//      scroll-margin) and SELF-CORRECTS — re-scrolling up to a few passes until
//      the target is genuinely on screen, so content that loads after mount
//      (photos, map, cover) can't leave the landing short,
//   4. THEN flashes the matched term (wraps the first occurrence in
//      `.search-flash`, unwraps it ~1.2s later) so it's visible on arrival and
//      persists for its full duration.
// Degradation: term absent from the target text → scroll only, no mark.
// Reduced motion: scroll is instant (auto), and the flash is still applied
// STATICALLY (no fade animation — the CSS reduced-motion gate collapses it to
// 0.01ms) — the highlight is always delivered.
export function useScrollHighlight(resolveId: (scrollTo: string) => string): void {
  const query = useRouteQuery();
  const scrollTo = query.scrollTo;
  const term = query.q;
  const resolveIdRef = useRef(resolveId);
  resolveIdRef.current = resolveId;

  useEffect(() => {
    if (!scrollTo) return;
    const id = resolveIdRef.current(scrollTo);
    const reduced = prefersReducedMotion();
    let cancelled = false;
    let flashTimer = 0;

    const clearMark = (root: HTMLElement) =>
      root.querySelectorAll('mark.search-flash').forEach((m) => m.replaceWith(...m.childNodes));

    (async () => {
      const el = await waitForEl(id);
      if (cancelled || !el) return;
      // Clear any stale flash mark left by a prior query before scrolling
      // (the previous effect's cleanup only clears its timer, not the DOM).
      clearMark(el);
      // Don't start the deep-link scroll until the route is FULLY revealed: on
      // navigation the App holds the incoming page invisible (`.preparing`,
      // opacity 0) for up to ~600ms while its data/photos load, and scrolling
      // inside that window races the swap + late-loading layout. Waiting here
      // makes navigation behave exactly like refresh — the page is settled and
      // visible, so the scroll is the sole, post-settle controller.
      await waitForReveal();
      if (cancelled) return;
      // Self-correcting scroll: re-scrolls until the target is genuinely on
      // screen, so content that loads after the first scroll can't leave the
      // landing short. Reduced motion scrolls instantly (auto).
      await scrollAndLand(el, reduced ? 'auto' : 'smooth');
      if (cancelled) return;
      // Apply the flash AFTER the scroll settles so it's visible on arrival.
      // Reduced motion still flashes — statically, no animation.
      if (!term || !flashTerm(el, term)) return;
      flashTimer = window.setTimeout(() => clearMark(el), FLASH_MS);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(flashTimer);
    };
  }, [scrollTo, term]);
}
