import { useEffect, useState } from 'preact/hooks';

// Duration base for every overlay close — the single source the CSS closing
// duration references (--motion-base). The JS unmount timer and the CSS fade
// must always be the same value.
export const EXIT_FADE_DEFAULT_MS = 220;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// Keeps an overlay mounted long enough to play its exit animation when
// `isOpen` flips false. Returns `visible` (render while true) and `closing`
// (apply your .closing class while true). Default duration (220ms) matches the
// CSS --motion-base fade-out; pass a different value only for overlays whose
// closing CSS is deliberately shorter (e.g. the lightbox's --motion-fast).
//
// Honors prefers-reduced-motion: under reduced motion the close duration is 0,
// so overlays unmount immediately instead of being silently delayed by the
// full fade — the CSS side is handled by the global reduced-motion gate.
export function useExitFade(
  isOpen: boolean,
  durationMs = EXIT_FADE_DEFAULT_MS,
): { visible: boolean; closing: boolean } {
  const [visible, setVisible] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setVisible(true);
      return;
    }
    if (visible) {
      setClosing(true);
      const t = setTimeout(() => setVisible(false), prefersReducedMotion() ? 0 : durationMs);
      return () => clearTimeout(t);
    }
  }, [isOpen, visible, durationMs]);

  return { visible, closing };
}
