import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Router, Switch, Route, Redirect } from 'wouter-preact';
import { Setup } from './ui/setup';
import { PWAInstallPrompt, IOSBackupReminder, useAppPrompts } from './components/app-prompts';
import { Home } from './ui/home';
import { Settings } from './ui/settings';
import { SearchOverlay } from './ui/search-overlay';
import { useRideBook } from './ui/use-ride-book';
import { useGalleryPhotos } from './ui/use-gallery-photos';
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
// cache) keeps running; the rendered location is the delayed swap.
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

// Read the search query from the fragment's ?q= parameter ("#/search?q=manali").
const readSearchQueryFromHash = (hash: string): string => {
  const qi = hash.indexOf('?');
  if (qi === -1) return '';
  return new URLSearchParams(hash.slice(qi + 1)).get('q') ?? '';
};

// Read the active lightbox photo from the fragment's ?photo= parameter
// ("#/photos?photo=12:3"). null means no lightbox; the value is the photo id.
const readPhotoQueryFromHash = (hash: string): string | null => {
  const qi = hash.indexOf('?');
  if (qi === -1) return null;
  return new URLSearchParams(hash.slice(qi + 1)).get('photo');
};

export function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [showContent, setShowContent] = useState(true);
  const [hasSWUpdate, setHasSWUpdate] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const appPrompt = useAppPrompts();
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const activePrompt = dismissedPrompt ? null : appPrompt;
  const prevHashRef = useRef(window.location.hash || HASH_HOME);
  // The last in-app hash the user was on before the current one, kept on every
  // hashchange. Drives the in-app back button: when a valid in-app predecessor
  // exists, back pops history to it (search query, lightbox, parent ride all
  // restored exactly); on a deep link with no predecessor it falls back to the
  // page's logical parent. replaceState-only edits (?q= typing, ?photo= prev/
  // next) never fire hashchange, so they can't pollute this.
  const prevInAppHashRef = useRef<string | null>(null);

  // Shared ride-book data (rides + legs + covers) for both home and search.
  // The status variant also reports the initial Dexie live-query load so the
  // search overlay can show a skeleton instead of flashing its empty state.
  const { rides, loading } = useRideBook({ withStatus: true });

  // Search query, synced to the URL's ?q= parameter via history.replaceState
  // (never pushes). Re-read from the hash on every route change so a direct
  // load or Back-from-result restores the query.
  const [searchQuery, setSearchQuery] = useState(() =>
    readSearchQueryFromHash(window.location.hash),
  );
  // Active lightbox photo, synced to the URL's ?photo= parameter on the photos
  // page (null = closed). Re-read from the hash on every route change so a
  // direct load or Back-from-view-ride restores the exact photo.
  const [photoId, setPhotoId] = useState<string | null>(() =>
    readPhotoQueryFromHash(window.location.hash),
  );
  // Shared gallery photo list, computed once above the router so the photos
  // page wall and the lightbox read the same shuffled arrangement.
  const galleryPhotos = useGalleryPhotos(rides);
  const scrollCacheRef = useRef(new Map<string, number>());
  const revealTimerRef = useRef<number | null>(null);
  const swapTimerRef = useRef<number | null>(null);

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

      // Remember the outgoing hash as the in-app predecessor for the back
      // button — before the same-page guard can early-return, so ?photo= /
      // ?modal= pushes on the same route still register the page they were
      // opened from.
      prevInAppHashRef.current = prevHash;

      // Save the outgoing route's scroll position (DOM is still the old route here)
      scrollCacheRef.current.set(prevHash, window.scrollY);
      prevHashRef.current = nextHash;
      // Keep the lightbox photo in sync with the URL (deep link /
      // Back-restore).
      setPhotoId(readPhotoQueryFromHash(nextHash));

      // Re-read the search query from the URL only when ARRIVING at /search
      // (fresh visit, deep link, or Back-from-result restores the query).
      // While leaving search, keep the last query value instead of clobbering
      // it with '' — the page stays mounted through the 120ms exit fade, and
      // resetting the query mid-fade flips its committed results to the
      // empty-query browse-all catalog ("catalog flash").
      if (normalizeRoute(nextHash) === '/search') {
        setSearchQuery(readSearchQueryFromHash(nextHash));
      }

      // Query-param-only changes on the same page do not re-transition the
      // viewport: the overlay renders over the static page and plays its own
      // fade. This covers the R1 lightbox ("#/photos" -> "#/photos?photo=1")
      // and the R2 page modals ("#/ride/1" -> "#/ride/1?modal=map", "#/leg/1"
      // -> "#/leg/1?modal=arrange", "#/edit?mode=…&modal=arrange").
      if (normalizeRoute(prevHash) === normalizeRoute(nextHash)) return;

      // Content-gated transition (Option A): fade the outgoing route out,
      // swap the route once that fade completes, then keep the viewport
      // invisible until the routed view reports its data is rendered (via
      // onReady), and fade it in. Non-data views reveal immediately. A safety
      // timer backstops views that never signal.
      setShowContent(false);
      if (swapTimerRef.current !== null) clearTimeout(swapTimerRef.current);
      swapTimerRef.current = window.setTimeout(() => {
        setRouteSnapshot(nextHash);

        if (isGatedRoute(nextHash)) {
          if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
          revealTimerRef.current = window.setTimeout(finishTransition, 600);
        } else {
          finishTransition();
        }

        // Restore or reset scroll only after the outgoing view has faded out
        // and the new one has mounted. Snapping earlier would yank a scrolled
        // page to the top while it is still visible and fading out. With the
        // coordination layer gone (R3) there is no back/forward discriminator,
        // so restore any previously-visited route's cached position and top
        // otherwise — the common "Back returns where I was scrolled" case
        // holds for browser Back and the logical-parent back button alike.
        requestAnimationFrame(() => {
          restoreScroll(scrollCacheRef.current.get(nextHash));
        });
      }, 120);
    };

    const handleSWUpdate = () => setHasSWUpdate(true);

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('sw-update', handleSWUpdate);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('sw-update', handleSWUpdate);
      if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
      if (swapTimerRef.current !== null) clearTimeout(swapTimerRef.current);
    };
  }, [finishTransition]);

  const navigateTo = useCallback((route: string) => {
    window.location.hash = route;
  }, []);

  // Sync a query edit to the URL with history.replaceState — never pushes a
  // history entry, so Back still returns to the previous page instead of
  // walking back through keystrokes.
  const handleSearchQueryChange = useCallback((q: string) => {
    setSearchQuery(q);
    const path = window.location.hash.split('?')[0];
    const next = q ? `${path}?q=${encodeURIComponent(q)}` : path;
    history.replaceState(history.state, '', next);
  }, []);

  // Closing search (× / Escape) is a plain history.back(): the route swap
  // fades the page out. Direct-load on #/search with no prior entry exits the
  // app, which is standard mobile-web behavior (accepted).
  const closeSearchPage = useCallback(() => {
    history.back();
  }, []);

  // Opening the lightbox pushes "#/photos?photo=N" onto the history stack, so
  // Back (or × / Escape / backdrop) closes it with a single pop.
  const openLightbox = useCallback((photoId: string) => {
    window.location.hash = `#/photos?photo=${encodeURIComponent(photoId)}`;
  }, []);

  const closeLightbox = useCallback(() => {
    history.back();
  }, []);

  // Prev/next inside the lightbox: replace the ?photo= param in place so Back
  // does not stack an entry per photo — the open and close stay a push/pop pair.
  const setLightboxPhoto = useCallback((photoId: string) => {
    setPhotoId(photoId);
    history.replaceState(history.state, '', `#/photos?photo=${encodeURIComponent(photoId)}`);
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

  // Back navigation: return to where the user actually came from — the search
  // results, the gallery lightbox, a parent ride — by popping history when an
  // in-app predecessor exists, so the previous URL, query params, and lightbox
  // state are restored exactly. With no predecessor (fresh deep link) or on a
  // same-hash edge, fall back to the caller's logical parent via replace, so
  // the app is never left. No depth tracking: one ref, updated on hashchange.
  const navigateBack = useCallback((logicalParent: string | null) => {
    const current = window.location.hash || HASH_HOME;
    const prev = prevInAppHashRef.current;
    const hasInAppPredecessor =
      prev !== null && prev.startsWith('#/') && prev !== current;
    if (hasInAppPredecessor) {
      history.back();
    } else if (logicalParent) {
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

  // 2. Hash Route Router (wouter). Forward navigation still goes through
  //    navigateTo (window.location.hash) so the app's hashchange handler keeps
  //    running; matching and typed params are wouter's, fed by the controlled
  //    location so the 120ms fade-out swap still gates rendering.
  const homeElement = (
    <Home ridesData={rides} onNavigate={navigateTo} onReady={finishTransition} />
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
        <Route path="/settings">{() => <Settings onNavigate={navigateTo} onNavigateBack={navigateBack} />}</Route>
        <Route path="/todo">{() => <Todo onNavigateBack={navigateBack} />}</Route>
        <Route path="/photos">{() => (
          <Photos
            ridesData={rides}
            photos={galleryPhotos}
            photoId={photoId}
            onOpenPhoto={openLightbox}
            onClose={closeLightbox}
            onNavigatePhoto={setLightboxPhoto}
            onNavigate={navigateTo}
            onNavigateBack={navigateBack}
          />
        )}</Route>
        <Route path="/search">{() => (
          <SearchOverlay
            ridesData={rides ?? []}
            loading={loading}
            query={searchQuery}
            onQueryChange={handleSearchQueryChange}
            onNavigate={navigateTo}
            onClose={closeSearchPage}
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
