import { useCallback, useEffect, useState } from 'preact/hooks';
import { useBodyScrollLock } from './use-body-scroll-lock';

// History-aware modal lifecycle shared by the ride/leg detail pages.
//
// Opening pushes a named history entry; closing pops that entry back off so the
// browser history stays free of phantom entries (otherwise the next in-app back
// would silently consume it and look like a dead press). Browser/hardware back
// pops the entry and fires popstate, which clears the open state here.
export function useHistoryModal(key: string) {
  const [isOpen, setIsOpen] = useState(false);
  // Lock the page scroll while any history-backed overlay is open.
  useBodyScrollLock(isOpen);

  const open = useCallback(() => {
    setIsOpen(true);
    history.pushState({ modalOpen: key }, "");
  }, [key]);

  const close = useCallback(() => {
    // Only pop when our own entry is on top. A close that arrived after the
    // browser already popped it (back button) just clears the open state.
    const state = history.state as { modalOpen?: string } | null;
    if (state && state.modalOpen === key) {
      history.back();
      return;
    }
    setIsOpen(false);
  }, [key]);

  // Clear the open state whenever the browser traverses over our entry. The
  // modal components also listen for popstate and call onClose, so this is a
  // safety net (close is idempotent) — keeping the lifecycle in one place.
  useEffect(() => {
    if (!isOpen) return;
    const handlePopState = () => setIsOpen(false);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isOpen]);

  return [isOpen, open, close] as const;
}
