import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Setup } from './ui/setup';
import { PWAInstallPrompt, IOSBackupReminder, useAppPrompts } from './components/app-prompts';
import { Home } from './ui/home';
import { SearchOverlay } from './ui/search-overlay';
import { useRideBook } from './ui/use-ride-book';
import { TestRunner } from './ui/test-runner';
import { Editor } from './ui/editor';
import { Backup } from './ui/backup';
import { Todo } from './ui/todo';
import { RideDetail } from './ui/ride-detail';
import { LegDetail } from './ui/leg-detail';
import {
  HASH_HOME,
  HASH_BACKUP,
  HASH_EDIT,
  HASH_TODO,
  HASH_RIDE_PREFIX,
  HASH_LEG_PREFIX,
} from './constants';
import { getSWUpdate } from './main';

function isSearchHistoryEntry(state: unknown): boolean {
  return Boolean(
    state &&
      typeof state === 'object' &&
      (state as { searchOpen?: unknown }).searchOpen === true,
  );
}

export function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [showContent, setShowContent] = useState(true);
  const [hasSWUpdate, setHasSWUpdate] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const appPrompt = useAppPrompts();
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const activePrompt = dismissedPrompt ? null : appPrompt;
  const prevHashRef = useRef(window.location.hash || HASH_HOME);

  // Shared ride-book data (rides + legs + covers) for both home and search.
  const ridesData = useRideBook();

  // Search lives at the shell level so it survives navigation: navigating to a
  // result closes it, and returning to home reopens it with the same query.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchOpenRef = useRef(false);
  const searchResultRef = useRef(false);
  const searchBackRef = useRef(false);
  const searchCloseRef = useRef(false);
  const [searchCloseRequest, setSearchCloseRequest] = useState(0);

  const setSearchVisibility = useCallback((open: boolean) => {
    searchOpenRef.current = open;
    setSearchOpen(open);
  }, []);

  const openSearch = useCallback(() => {
    if (searchOpenRef.current) return;
    const currentState = history.state;
    const baseState = currentState && typeof currentState === 'object' ? currentState : {};
    // Keep search as a real history entry. The following result navigation then
    // sits above it, so Back can restore the overlay before returning home.
    history.pushState({ ...baseState, searchOpen: true }, '', window.location.href);
    setSearchVisibility(true);
  }, [setSearchVisibility]);

  const closeSearch = useCallback(() => {
    // A user close should consume the shell-level search entry. When the route
    // transition closes the overlay over a result, that entry is intentionally
    // kept so Back can restore the search session.
    if (isSearchHistoryEntry(history.state)) {
      searchCloseRef.current = true;
      history.back();
      return;
    }
    setSearchVisibility(false);
  }, [setSearchVisibility]);

  // Keep the search entry in the stack. The result becomes the next entry, so
  // Back returns to the mounted overlay and a second Back closes it normally.
  const navigateFromSearch = useCallback(
    (route: string) => {
      searchResultRef.current = true;
      window.location.hash = route;
    },
    []
  );
  const scrollCacheRef = useRef(new Map<string, number>());
  const revealTimerRef = useRef<number | null>(null);
  const swapTimerRef = useRef<number | null>(null);
  // Depth of in-app entries pushed above the initial load. The in-app back
  // button pops one of these with history.back() when > 0; at 0 it falls back
  // to navigating (replace) to the page's logical parent so a deep link never
  // accidentally leaves the app. A replace-fallback marks skipDepth so the
  // resulting hashchange isn't counted as a fresh forward push.
  const navDepthRef = useRef(0);
  const skipDepthRef = useRef(false);
  // history.length is the reliable back/forward signal: a forward push
  // increments it, while a back/forward traversal keeps it constant. Chrome
  // fires popstate on plain fragment navigation too (anchor clicks, hash
  // assignment), so popstate cannot be used to tell forward from back.
  const prevHistoryLenRef = useRef(window.history.length);

  // Reveal the new route once its content is ready to render (fade-in gate).
  const finishTransition = useCallback(() => {
    if (revealTimerRef.current !== null) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setShowContent(true);
  }, []);

  // Check setup status and monitor hash changes
  useEffect(() => {
    // Take over scroll restoration so each route restores its own position
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    const isSetup = localStorage.getItem('retread-setup-complete') === 'true';
    setSetupComplete(isSetup);

    const restoreScroll = (savedY: number | undefined) => {
      if (typeof savedY !== 'number') {
        window.scrollTo(0, 0);
        return;
      }
      // Poll until the route's async data has loaded enough to reach the saved
      // position (views like TripDetail render a short loading state first).
      let tries = 0;
      const attempt = () => {
        tries++;
        const docHeight = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        );
        const maxScroll = Math.max(0, docHeight - window.innerHeight);
        if (maxScroll >= savedY - 1 || tries > 120) {
          window.scrollTo(0, Math.min(savedY, maxScroll));
          return;
        }
        requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    };

    // Routes whose views load data asynchronously and gate their fade-in on
    // an onReady signal. All other routes (editor, backup, 404) reveal instantly.
    const isGatedRoute = (hash: string) =>
      hash === HASH_HOME ||
      hash === '' ||
      hash.startsWith(HASH_RIDE_PREFIX) ||
      hash.startsWith(HASH_LEG_PREFIX);

    const handleHashChange = () => {
      const checkedSetup = localStorage.getItem('retread-setup-complete') === 'true';
      setSetupComplete(checkedSetup);

      const prevHash = prevHashRef.current;
      const nextHash = window.location.hash || HASH_HOME;

      // Save the outgoing route's scroll position (DOM is still the old route here)
      scrollCacheRef.current.set(prevHash, window.scrollY);
      prevHashRef.current = nextHash;

      // Back/forward (popstate) vs fresh navigation. Chrome fires popstate on
      // plain fragment navigation too, so instead compare history.length: a
      // forward push grows it, a back/forward traversal leaves it unchanged.
      const historyLen = window.history.length;
      const isPop = historyLen === prevHistoryLenRef.current;
      prevHistoryLenRef.current = historyLen;

      // Keep the in-app depth counter in sync so navigateBack knows whether a
      // history.back() is safe. Pops subtract, forward pushes add; a
      // replace-fallback from navigateBack is flagged with skipDepth so the
      // resulting hashchange isn't counted as a fresh push.
      if (skipDepthRef.current) {
        skipDepthRef.current = false;
      } else if (isPop) {
        navDepthRef.current = Math.max(0, navDepthRef.current - 1);
      } else {
        navDepthRef.current += 1;
      }

      // Content-gated transition (Option A): fade the outgoing route out,
      // swap the route once that fade completes, then keep the viewport
      // invisible until the routed view reports its data is rendered (via
      // onReady), and fade it in. Non-data views reveal immediately. A safety
      // timer backstops views that never signal.
      setShowContent(false);
      if (swapTimerRef.current !== null) clearTimeout(swapTimerRef.current);
      swapTimerRef.current = window.setTimeout(() => {
        setCurrentHash(nextHash);

        // Resolve search at the swap, after the new route has mounted. A
        // marked search entry restores the mounted overlay and its query when
        // reached by Back; leaving an open overlay closes it over the new page.
        if (
          (searchBackRef.current || isPop) &&
          (isSearchHistoryEntry(history.state) || searchResultRef.current) &&
          (nextHash === HASH_HOME || nextHash === '')
        ) {
          searchBackRef.current = false;
          searchResultRef.current = false;
          setSearchVisibility(true);
        }

        // Route changes away from an open search entry should close the
        // overlay, including browser Forward after returning to search. The
        // route transition itself remains owned by this global handler.
        if (searchOpenRef.current && nextHash !== HASH_HOME && nextHash !== '') {
          setSearchVisibility(false);
        }
        if (isGatedRoute(nextHash)) {
          if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
          revealTimerRef.current = window.setTimeout(finishTransition, 600);
        } else {
          finishTransition();
        }

        // Restore or reset scroll only after the outgoing view has faded out
        // and the new one has mounted. Snapping earlier would yank a scrolled
        // page to the top while it is still visible and fading out.
        requestAnimationFrame(() => {
          if (isPop) {
            restoreScroll(scrollCacheRef.current.get(nextHash));
          } else {
            window.scrollTo(0, 0);
          }
        });
      }, 120);
    };

    const handlePopState = (event: PopStateEvent) => {
      const nextHash = window.location.hash || HASH_HOME;
      const currentHash = prevHashRef.current || HASH_HOME;

      // A user close should not reopen on an older duplicate search entry.
      // Consume consecutive search entries until the real page entry is back
      // on top, then let the normal close animation finish.
      if (searchCloseRef.current) {
        if (isSearchHistoryEntry(event.state)) {
          history.back();
          return;
        }
        searchCloseRef.current = false;
      }

      // Page-header Back explicitly requested the search entry. Restore it
      // immediately while the normal hash transition finishes underneath.
      if (searchBackRef.current && (nextHash === HASH_HOME || nextHash === '')) {
        setSearchVisibility(true);
        return;
      }

      // A same-route traversal to the search entry is browser Forward after a
      // user closed the search. Hash changes are handled by handleHashChange.
      if (isSearchHistoryEntry(event.state) && nextHash === currentHash) {
        setSearchVisibility(true);
        return;
      }

      // Same-route traversal away from the search entry is the second Back in
      // the search flow. Ask the overlay to play its normal closing animation;
      // the history entry has already been consumed by the browser.
      if (!isSearchHistoryEntry(event.state) && nextHash === currentHash) {
        setSearchCloseRequest((request) => request + 1);
      }
    };

    const handleSWUpdate = () => setHasSWUpdate(true);

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('sw-update', handleSWUpdate);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('sw-update', handleSWUpdate);
      if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
      if (swapTimerRef.current !== null) clearTimeout(swapTimerRef.current);
    };
  }, [finishTransition, setSearchVisibility]);

  const navigateTo = useCallback((route: string) => {
    window.location.hash = route;
  }, []);

  // Show the scroll-to-top button once the page has scrolled down far enough
  // to be worth jumping back. Hides again when near the top.
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back navigation: pop the browser history when there's an in-app entry to
  // return to, otherwise fall back to the page's logical parent (replacing the
  // current entry so a deep link doesn't pile up). At the root with no history
  // there is no parent, so back simply does nothing and Android back exits.
  const navigateBack = useCallback((logicalParent: string | null) => {
    // Search is a shell-level history entry rather than a routed page, so it
    // is not included in navDepthRef. A page reached from search must still
    // pop once to restore that entry instead of falling back to home.
    if (searchResultRef.current) {
      searchBackRef.current = true;
      history.back();
      return;
    }
    if (navDepthRef.current > 0) {
      history.back();
      return;
    }
    if (logicalParent) {
      skipDepthRef.current = true;
      window.location.replace(logicalParent);
    }
  }, []);

  // 1. Force Setup Wizard on first launch
  if (!setupComplete) {
    return (
      <div class="app-container">
        <main class="viewport">
          <Setup onComplete={() => setSetupComplete(true)} />
        </main>
      </div>
    );
  }

  // 2. Hash Route Router
  const renderRoute = () => {
    const hash = currentHash || HASH_HOME;

    if (hash === HASH_HOME || hash === '') {
      return <Home ridesData={ridesData} onNavigate={navigateTo} onOpenSearch={openSearch} onReady={finishTransition} />;
    }
    
    if (hash === '#/test') {
      if (import.meta.env.DEV) {
        return <TestRunner />;
      }
      return <Home ridesData={ridesData} onNavigate={navigateTo} onOpenSearch={openSearch} onReady={finishTransition} />;
    }
    
    if (hash.startsWith(HASH_RIDE_PREFIX)) {
      const rideId = hash.split('/').pop();
      const parsedId = rideId ? parseInt(rideId, 10) : NaN;
      if (isNaN(parsedId)) return <Home ridesData={ridesData} onNavigate={navigateTo} onOpenSearch={openSearch} onReady={finishTransition} />;
      return <RideDetail rideId={parsedId} onNavigate={navigateTo} onNavigateBack={navigateBack} onReady={finishTransition} />;
    }

    if (hash.startsWith(HASH_LEG_PREFIX)) {
      const legId = hash.split('/').pop();
      const parsedId = legId ? parseInt(legId, 10) : NaN;
      if (isNaN(parsedId)) return <Home ridesData={ridesData} onNavigate={navigateTo} onOpenSearch={openSearch} onReady={finishTransition} />;
      return <LegDetail legId={parsedId} onNavigate={navigateTo} onNavigateBack={navigateBack} onReady={finishTransition} />;
    }

    if (hash.startsWith(HASH_EDIT)) {
      return <Editor onNavigate={navigateTo} onNavigateBack={navigateBack} />;
    }

    if (hash === HASH_BACKUP) {
      return <Backup onNavigate={navigateTo} onNavigateBack={navigateBack} />;
    }

    if (hash === HASH_TODO) {
      return <Todo onNavigateBack={navigateBack} />;
    }

    // Fallback 404
    return (
      <div class="placeholder-view">
        <h3>Page Not Found</h3>
        <button class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;" onClick={() => navigateTo(HASH_HOME)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="12" x2="2" y2="12"></line>
              <polyline points="9 19 2 12 9 5"></polyline>
            </svg>
            <span>Back Home</span>
          </button>
      </div>
    );
  };

  return (
    <div class="app-container">
      {hasSWUpdate && (
        <div class="sw-update-banner">
          <span>New version available</span>
          <button class="btn btn-primary btn-sm" onClick={() => getSWUpdate()?.()}>Refresh</button>
        </div>
      )}
      <main class={`viewport${showContent ? '' : ' preparing'}`}>
        {renderRoute()}
      </main>

      {showScrollTop && (
        <button
          type="button"
          class="btn-scroll-top"
          aria-label="Scroll to top"
          onClick={scrollToTop}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      )}

      {/* Global search overlay — lives above the routed viewport so it survives
          navigation (open it, tap a result, come back, it's still here). */}
      <SearchOverlay
        isOpen={searchOpen}
        ridesData={ridesData ?? []}
        onNavigate={navigateFromSearch}
        onClose={closeSearch}
        closeRequest={searchCloseRequest}
      />

      {activePrompt === 'pwa-install' && (
        <PWAInstallPrompt onClose={() => setDismissedPrompt(true)} />
      )}
      {activePrompt === 'ios-backup' && (
        <IOSBackupReminder
          onClose={() => setDismissedPrompt(true)}
          onNavigate={navigateTo}
        />
      )}
    </div>
  );
}
