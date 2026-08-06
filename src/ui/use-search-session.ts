import { useState, useCallback, useRef } from 'preact/hooks';
import { HASH_HOME } from '../constants';

function isSearchHistoryEntry(state: unknown): boolean {
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as { searchOpen?: unknown }).searchOpen === true,
  );
}

export interface SearchSession {
  isOpen: boolean;
  query: string;
  setQuery: (q: string) => void;
  closeRequest: number;
  openSearch: () => void;
  closeSearch: () => void;
  navigateFromSearch: (route: string) => void;
  // True when Back was pressed from a search-opened page; pops the search
  // entry so the overlay restores instead of falling back to home.
  consumeBackFromResult: () => boolean;
  // Called at the route-swap moment (after the outgoing fade) so the overlay
  // reopens for Back to home and closes when navigating to a real page.
  onRouteSwapped: (nextHash: string, isPop: boolean) => void;
  // Delegated from the app's global popstate handler for search-only cases.
  onPopState: (event: PopStateEvent, currentHash: string) => void;
}

// Shell-level search overlay state. It lives above the routed viewport and
// keeps its own history entries (searchOpen), so opening search, jumping to a
// result, and coming back restores the same query.
export function useSearchSession(): SearchSession {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [closeRequest, setCloseRequest] = useState(0);

  const isOpenRef = useRef(false);
  const resultRef = useRef(false);
  const backRef = useRef(false);
  const closeRef = useRef(false);

  const setVisibility = useCallback((open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);
  }, []);

  const openSearch = useCallback(() => {
    if (isOpenRef.current) return;
    const currentState = history.state;
    const baseState = currentState && typeof currentState === 'object' ? currentState : {};
    // Keep search as a real history entry. The following result navigation then
    // sits above it, so Back can restore the overlay before returning home.
    history.pushState({ ...baseState, searchOpen: true }, '', window.location.href);
    setVisibility(true);
  }, [setVisibility]);

  const closeSearch = useCallback(() => {
    // A user close should consume the shell-level search entry. When the route
    // transition closes the overlay over a result, that entry is intentionally
    // kept so Back can restore the search session.
    setQuery('');
    if (isSearchHistoryEntry(history.state)) {
      closeRef.current = true;
      history.back();
      return;
    }
    setVisibility(false);
  }, [setVisibility]);

  const navigateFromSearch = useCallback((route: string) => {
    resultRef.current = true;
    window.location.hash = route;
  }, []);

  const consumeBackFromResult = useCallback(() => {
    if (resultRef.current) {
      backRef.current = true;
      history.back();
      return true;
    }
    return false;
  }, []);

  const onRouteSwapped = useCallback(
    (nextHash: string, isPop: boolean) => {
      // A marked search entry restores the mounted overlay and its query when
      // reached by Back; leaving an open overlay closes it over the new page.
      if (
        (backRef.current || isPop) &&
        (isSearchHistoryEntry(history.state) || resultRef.current) &&
        (nextHash === HASH_HOME || nextHash === '')
      ) {
        backRef.current = false;
        resultRef.current = false;
        setVisibility(true);
      }
      // Route changes away from an open search entry should close the overlay,
      // including browser Forward after returning to search.
      if (isOpenRef.current && nextHash !== HASH_HOME && nextHash !== '') {
        setVisibility(false);
      }
    },
    [setVisibility]
  );

  const onPopState = useCallback(
    (event: PopStateEvent, currentHash: string) => {
      const nextHash = window.location.hash || HASH_HOME;

      // A user close should not reopen on an older duplicate search entry.
      // Consume consecutive search entries until the real page entry is back
      // on top, then let the normal close animation finish.
      if (closeRef.current) {
        if (isSearchHistoryEntry(event.state)) {
          history.back();
          return;
        }
        closeRef.current = false;
      }

      // Page-header Back explicitly requested the search entry. Restore it
      // immediately while the normal hash transition finishes underneath.
      if (backRef.current && (nextHash === HASH_HOME || nextHash === '')) {
        setVisibility(true);
        return;
      }

      // A same-route traversal to the search entry is browser Forward after a
      // user closed the search. Hash changes are handled by the app's handler.
      if (isSearchHistoryEntry(event.state) && nextHash === currentHash) {
        setVisibility(true);
        return;
      }

      // Same-route traversal away from the search entry is the second Back in
      // the search flow. Ask the overlay to play its closing animation.
      if (!isSearchHistoryEntry(event.state) && nextHash === currentHash) {
        setCloseRequest((request) => request + 1);
      }
    },
    [setVisibility]
  );

  return {
    isOpen,
    query,
    setQuery,
    closeRequest,
    openSearch,
    closeSearch,
    navigateFromSearch,
    consumeBackFromResult,
    onRouteSwapped,
    onPopState,
  };
}
