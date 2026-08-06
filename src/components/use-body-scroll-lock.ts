import { useEffect } from 'preact/hooks';

// Ref-counted body scroll lock: overlapping locks (a modal over a routed page,
// a prompt over a modal) must not unlock early. Each active lock increments a
// module-level counter; the body stays locked until the LAST lock releases.
// (The old snapshot-per-lock approach let a second lock capture 'hidden' and
// then restore it while the first lock was still open.)
let lockCount = 0;

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockCount += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = '';
      }
    };
  }, [active]);
}
