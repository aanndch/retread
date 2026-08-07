import { useEffect, useRef } from 'preact/hooks';
import { useRouteQuery } from './use-route-query';
import { normalize } from '../ui/search-match';

// Total flash lifespan (~1.2s): fade-in ~200ms, hold, fade-out ~400ms. The
// timings ride the --motion-fast/--motion-slow scale (a single JS-driven sweep,
// not covered by the CSS reduced-motion gate — see prefersReducedMotion below).
const FLASH_MS = 1200;

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

// Deep-link scroll-to + flash-highlight. Reads `?scrollTo=<target>&q=<term>`
// from the route query (useRouteQuery) and, on mount / param change:
//   1. resolves the target element id from the `scrollTo` value via `resolveId`
//      (each page knows its own ids: leg → leg-note/leg-title, ride → ride-title),
//   2. scrolls it into view — land clear of pinned chrome via scroll-margin-top,
//   3. flashes the matched term (wraps the first occurrence in `.search-flash`,
//      unwraps it ~1.2s later).
// Degradation: term absent from the target text → scroll only, no mark.
// Reduced motion: scroll still happens (CSS forces it instant) but the flash is
// skipped — a JS class-toggle isn't covered by the CSS gate.
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
    let cleanup: (() => void) | undefined;
    // Data-gated routes (ride/leg) render their content asynchronously, so the
    // target element may not exist on the first effect run. Poll (like the
    // App's restoreScroll) until it appears, then scroll + flash it.
    let tries = 0;
    const attempt = () => {
      tries++;
      const el = document.getElementById(id);
      if (el) {
        // Clear any stale flash mark left by a prior query before scrolling
        // (the previous effect's cleanup only clears its timeout, not the DOM).
        el.querySelectorAll('mark.search-flash').forEach((m) => m.replaceWith(...m.childNodes));
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        if (reduced || !term || !flashTerm(el, term)) return;
        const timeout = window.setTimeout(() => {
          el.querySelectorAll('mark.search-flash').forEach((m) => m.replaceWith(...m.childNodes));
        }, FLASH_MS);
        cleanup = () => window.clearTimeout(timeout);
        return;
      }
      if (tries <= 240) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
    return () => cleanup?.();
  }, [scrollTo, term]);
}
