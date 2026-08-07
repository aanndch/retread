import { useEffect, useRef } from 'preact/hooks';
import { useRouteQuery } from './use-route-query';

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Deep-link scroll-to from search results. Reads `?scrollTo=<target>&q=<term>`
// from the route query (useRouteQuery) and, on mount / param change, resolves
// the target element id from the `scrollTo` value via `resolveId` (each page
// knows its own ids: leg → leg-note/leg-title, ride → ride-title) and scrolls
// it into view — landing clear of pinned chrome via scroll-margin-top. Reduced
// motion still scrolls (the CSS gate forces it instant).
export function useScrollHighlight(resolveId: (scrollTo: string) => string): void {
  const query = useRouteQuery();
  const scrollTo = query.scrollTo;
  const resolveIdRef = useRef(resolveId);
  resolveIdRef.current = resolveId;

  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(resolveIdRef.current(scrollTo));
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [scrollTo]);
}
