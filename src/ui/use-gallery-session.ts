import { useState, useCallback, useRef } from 'preact/hooks';
import { HASH_PHOTOS } from '../constants';

function isGalleryHistoryEntry(state: unknown): boolean {
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as { galleryOpen?: unknown }).galleryOpen === true,
  );
}

export interface GallerySession {
  isOpen: boolean;
  activePhotoId: string | null;
  open: (photoId: string) => void;
  setActive: (photoId: string) => void;
  close: () => void;
  viewRide: (route: string) => void;
  onRouteSwapped: (nextHash: string, isPop: boolean) => void;
  onPopState: (event: PopStateEvent) => void;
}

// Shell-level gallery overlay session (the same pattern as search): the overlay
// lives above the routed viewport so it survives navigation. Opening pushes a
// gallery history entry; "View ride" navigates away and Back returns to the
// gallery with the overlay restored on the exact same photo.
export function useGallerySession(): GallerySession {
  const [isOpen, setIsOpen] = useState(false);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const isOpenRef = useRef(false);

  const setVisibility = useCallback((open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);
  }, []);

  const open = useCallback((photoId: string) => {
    setActivePhotoId(photoId);
    history.pushState({ galleryOpen: true }, '', window.location.href);
    setVisibility(true);
  }, [setVisibility]);

  const setActive = useCallback((photoId: string) => setActivePhotoId(photoId), []);

  const close = useCallback(() => {
    if (isGalleryHistoryEntry(history.state)) {
      history.back();
      return;
    }
    setVisibility(false);
  }, [setVisibility]);

  const viewRide = useCallback((route: string) => {
    window.location.hash = route;
  }, []);

  const onRouteSwapped = useCallback(
    (nextHash: string, isPop: boolean) => {
      // Back to the gallery after "View ride": the gallery entry is back on top,
      // so restore the overlay with the same photo.
      if (isPop && nextHash === HASH_PHOTOS && isGalleryHistoryEntry(history.state)) {
        setVisibility(true);
      }
      // Navigating away from the gallery closes the overlay but keeps its entry
      // in the stack so Back can restore it.
      if (isOpenRef.current && nextHash !== HASH_PHOTOS) {
        setVisibility(false);
      }
    },
    [setVisibility]
  );

  const onPopState = useCallback(
    (_event: PopStateEvent) => {
      // Any traversal while the overlay is open dismisses it (Back popped the
      // gallery entry). View-ride restores are handled at the route swap above.
      if (isOpenRef.current) {
        setVisibility(false);
      }
    },
    [setVisibility]
  );

  return { isOpen, activePhotoId, open, setActive, close, viewRide, onRouteSwapped, onPopState };
}
