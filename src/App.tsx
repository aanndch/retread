import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Router, Switch, Route, Redirect } from 'wouter-preact';
import { Setup } from './ui/setup';
import { PWAInstallPrompt, IOSBackupReminder, useAppPrompts } from './components/app-prompts';
import { Home } from './ui/home';
import { SearchOverlay } from './ui/search-overlay';
import { useRideBook } from './ui/use-ride-book';
import { useSearchSession } from './ui/use-search-session';
import { useGalleryPhotos } from './ui/use-gallery-photos';
import { useGallerySession } from './ui/use-gallery-session';
import { PhotosOverlay } from './ui/photos-overlay';
import { TestRunner } from './ui/test-runner';
import { Editor } from './ui/editor';
import { Backup } from './ui/backup';
import { Todo } from './ui/todo';
import { RideDetail } from './ui/ride-detail';
import { LegDetail } from './ui/leg-detail';
import { Photos } from './ui/photos';
import {
  HASH_HOME,
  HASH_RIDE_PREFIX,
  HASH_LEG_PREFIX,
} from './constants';
import { getSWUpdate } from './main';

// Normalize a raw location.hash ("#/ride/3", "#/edit?mode=x", "#/", "") to
// wouter's path-only location ("/ride/3", "/edit", "/"). The query is read
// separately by useHashSearch so useSearchParams works with in-hash queries.
function normalizeRoute(hash: string): string {
  const path = hash.replace(/^#?\/?/, '');
  return '/' + path.split('?')[0];
}

// Tiny external store so the Router renders a route only after the 120ms
// fade-out swap completes — preserving the app's exact transition feel while
// wouter owns matching.
let routeSnapshot = normalizeRoute(window.location.hash);
const routeListeners = new Set<() => void>();
function getRouteSnapshot() {
  return routeSnapshot;
}
function setRouteSnapshot(hash: string) {
  routeSnapshot = normalizeRoute(hash);
  routeListeners.forEach((l) => l());
}

// Controlled location hook fed to wouter's <Router>: navigation still goes
// through window.location.hash so the app's hashchange handler (fade, scroll
// cache, back-depth) keeps running; the rendered location is the delayed swap.
const useControlledHashLocation = (): [
  string,
  (to: string, opts?: { replace?: boolean; state?: unknown; transition?: boolean }) => void,
] => {
  const [location, setLocation] = useState(getRouteSnapshot);
  useEffect(() => {
    const listener = () => setLocation(getRouteSnapshot());
    routeListeners.add(listener);
    return () => {
      routeListeners.delete(listener);
    };
  }, []);
  const navigate = useCallback(
    (to: string, opts?: { replace?: boolean; state?: unknown; transition?: boolean }) => {
      if (opts?.replace) {
        window.location.replace(to);
      } else {
        window.location.hash = to;
      }
    },
    []
  );
  return [location, navigate];
};
// <Link href="/ride/3"> renders href="#/ride/3".
useControlledHashLocation.hrefs = (href: string) => '#' + href;
// wouter's default useSearch reads location.search, which is empty for our
// in-hash queries (`#/edit?mode=x`), so extract the query from the fragment.
const useHashSearch = () => {
  const hash = window.location.hash;
  const i = hash.indexOf('?');
  return i >= 0 ? hash.slice(i + 1) : '';
};
useControlledHashLocation.searchHook = useHashSearch;

export function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [hasSWUpdate, setHasSWUpdate] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const appPrompt = useAppPrompts();
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const activePrompt = dismissedPrompt ? null : appPrompt;
  const prevHashRef = useRef(window.location.hash || HASH_HOME);

  // Shared ride-book data (rides + legs + covers) for both home and search.
  // The status variant also reports the initial Dexie live-query load so the
  // search overlay can show a skeleton instead of flashing its empty state.
  const { rides, loading } = useRideBook({ withStatus: true });

  // Search lives at the shell level so it survives navigation: navigating to a
  // result closes it, and returning to home reopens it with the same query.
  const search = useSearchSession();
  // Shared gallery photo list + shell overlay session (survives navigation and
  // restores the exact photo after "View ride" -> Back).
  const galleryPhotos = useGalleryPhotos(rides);
  const gallery = useGallerySession();
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
      // Start the shell overlays' exit fade at the same moment the viewport
      // fades out, so navigation away never cuts a full-screen overlay to blank.
      search.onRouteLeaving(nextHash);
      gallery.onRouteLeaving(nextHash);
      if (swapTimerRef.current !== null) clearTimeout(swapTimerRef.current);
      swapTimerRef.current = window.setTimeout(() => {
        setRouteSnapshot(nextHash);

        // Resolve search at the swap, after the new route has mounted.
        search.onRouteSwapped(nextHash, isPop);
        gallery.onRouteSwapped(nextHash, isPop);
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
      search.onPopState(event, prevHashRef.current || HASH_HOME);
      gallery.onPopState(event);
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
  }, [finishTransition, search.onRouteLeaving, search.onRouteSwapped, search.onPopState, gallery.onRouteLeaving, gallery.onRouteSwapped, gallery.onPopState]);

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
    if (search.consumeBackFromResult()) return;
    if (navDepthRef.current > 0) {
      history.back();
      return;
    }
    if (logicalParent) {
      skipDepthRef.current = true;
      window.location.replace(logicalParent);
    }
  }, [search.consumeBackFromResult]);

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

  // 2. Hash Route Router (wouter). Forward navigation still goes through
  //    navigateTo (window.location.hash) so the app's hashchange handler keeps
  //    running; matching and typed params are wouter's, fed by the controlled
  //    location so the 120ms fade-out swap still gates rendering.
  const homeElement = (
    <Home ridesData={rides} onNavigate={navigateTo} onOpenSearch={search.openSearch} onReady={finishTransition} />
  );

  const renderRide = (id: string) => {
    const rideId = parseInt(id, 10);
    if (Number.isNaN(rideId)) return <Redirect to="/" />;
    return <RideDetail rideId={rideId} onNavigate={navigateTo} onNavigateBack={navigateBack} onReady={finishTransition} />;
  };

  const renderLeg = (id: string) => {
    const legId = parseInt(id, 10);
    if (Number.isNaN(legId)) return <Redirect to="/" />;
    return <LegDetail legId={legId} onNavigate={navigateTo} onNavigateBack={navigateBack} onReady={finishTransition} />;
  };

  const router = (
    <Router hook={useControlledHashLocation}>
      <Switch>
        <Route path="/">{() => homeElement}</Route>
        {import.meta.env.DEV && <Route path="/test">{() => <TestRunner />}</Route>}
        <Route path="/ride/:id">{({ id }) => renderRide(id!)}</Route>
        <Route path="/leg/:id">{({ id }) => renderLeg(id!)}</Route>
        <Route path="/edit">{() => <Editor onNavigate={navigateTo} onNavigateBack={navigateBack} />}</Route>
        <Route path="/backup">{() => <Backup onNavigate={navigateTo} onNavigateBack={navigateBack} />}</Route>
        <Route path="/todo">{() => <Todo onNavigateBack={navigateBack} />}</Route>
        <Route path="/photos">{() => (
          <Photos
            ridesData={rides}
            photos={galleryPhotos}
            onOpenPhoto={gallery.open}
            onNavigate={navigateTo}
            onNavigateBack={navigateBack}
          />
        )}</Route>
        <Route>
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
        </Route>
      </Switch>
    </Router>
  );

  return (
    <div class="app-container">
      {hasSWUpdate && (
        <div class="sw-update-banner">
          <span>New version available</span>
          <button class="btn btn-primary btn-sm" onClick={() => getSWUpdate()?.()}>Refresh</button>
        </div>
      )}
      <main class={`viewport${showContent ? '' : ' preparing'}`}>
        {router}
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
        isOpen={search.isOpen}
        ridesData={rides ?? []}
        loading={loading}
        query={search.query}
        onQueryChange={search.setQuery}
        onNavigate={search.navigateFromSearch}
        onClose={search.closeSearch}
        closeRequest={search.closeRequest}
      />

      {/* Global gallery lightbox — lives at the shell level so it survives the
          "View ride" navigation and Back restores the exact photo. */}
      <PhotosOverlay
        isOpen={gallery.isOpen}
        photos={galleryPhotos}
        activePhotoId={gallery.activePhotoId}
        onClose={gallery.close}
        onActiveChange={gallery.setActive}
        onViewRide={gallery.viewRide}
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
