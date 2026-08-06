import { useEffect } from 'preact/hooks';

// Lock the page scroll while an overlay/sheet is open so content behind a
// dialog can't keep scrolling (the "nothing moves behind the modal" practice).
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}
