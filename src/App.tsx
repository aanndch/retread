import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { Setup } from './ui/setup';
import { PWAInstallPrompt, IOSBackupReminder, useAppPrompts } from './components/app-prompts';
import { Home } from './ui/home';
import { TestRunner } from './ui/test-runner';
import { Editor } from './ui/editor';
import { Backup } from './ui/backup';
import { RideDetail } from './ui/ride-detail';
import { LegDetail } from './ui/leg-detail';
import {
  HASH_HOME,
  HASH_BACKUP,
  HASH_EDIT,
  HASH_RIDE_PREFIX,
  HASH_LEG_PREFIX,
} from './constants';
import { getSWUpdate } from './main';

export function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [showContent, setShowContent] = useState(true);
  const [hasSWUpdate, setHasSWUpdate] = useState(false);
  const appPrompt = useAppPrompts();
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const activePrompt = dismissedPrompt ? null : appPrompt;
  const prevHashRef = useRef(window.location.hash || HASH_HOME);
  const scrollCacheRef = useRef(new Map<string, number>());
  const isPopRef = useRef(false);
  const revealTimerRef = useRef<number | null>(null);
  const swapTimerRef = useRef<number | null>(null);
  // Depth of in-app entries pushed above the initial load. The in-app back
  // button pops one of these with history.back() when > 0; at 0 it falls back
  // to navigating (replace) to the page's logical parent so a deep link never
  // accidentally leaves the app. A replace-fallback marks skipDepth so the
  // resulting hashchange isn't counted as a fresh forward push.
  const navDepthRef = useRef(0);
  const skipDepthRef = useRef(false);

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

      // Back/forward (popstate) vs fresh navigation — only if the hash actually
      // changed, so modal popstate handlers don't corrupt the flag.
      const isPop = isPopRef.current && nextHash !== prevHash;
      isPopRef.current = false;

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

    const handlePop = () => {
      isPopRef.current = true;
    };

    const handleSWUpdate = () => setHasSWUpdate(true);

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handlePop);
    window.addEventListener('sw-update', handleSWUpdate);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handlePop);
      window.removeEventListener('sw-update', handleSWUpdate);
      if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
      if (swapTimerRef.current !== null) clearTimeout(swapTimerRef.current);
    };
  }, [finishTransition]);

  const navigateTo = useCallback((route: string) => {
    window.location.hash = route;
  }, []);

  // Back navigation: pop the browser history when there's an in-app entry to
  // return to, otherwise fall back to the page's logical parent (replacing the
  // current entry so a deep link doesn't pile up). At the root with no history
  // there is no parent, so back simply does nothing and Android back exits.
  const navigateBack = useCallback((logicalParent: string | null) => {
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
      return <Home onNavigate={navigateTo} onReady={finishTransition} />;
    }
    
    if (hash === '#/test') {
      if (import.meta.env.DEV) {
        return <TestRunner />;
      }
      return <Home onNavigate={navigateTo} onReady={finishTransition} />;
    }
    
    if (hash.startsWith(HASH_RIDE_PREFIX)) {
      const rideId = hash.split('/').pop();
      const parsedId = rideId ? parseInt(rideId, 10) : NaN;
      if (isNaN(parsedId)) return <Home onNavigate={navigateTo} onReady={finishTransition} />;
      return <RideDetail rideId={parsedId} onNavigate={navigateTo} onNavigateBack={navigateBack} onReady={finishTransition} />;
    }

    if (hash.startsWith(HASH_LEG_PREFIX)) {
      const legId = hash.split('/').pop();
      const parsedId = legId ? parseInt(legId, 10) : NaN;
      if (isNaN(parsedId)) return <Home onNavigate={navigateTo} onReady={finishTransition} />;
      return <LegDetail legId={parsedId} onNavigate={navigateTo} onNavigateBack={navigateBack} onReady={finishTransition} />;
    }

    if (hash.startsWith(HASH_EDIT)) {
      return <Editor onNavigate={navigateTo} onNavigateBack={navigateBack} />;
    }

    if (hash === HASH_BACKUP) {
      return <Backup onNavigate={navigateTo} onNavigateBack={navigateBack} />;
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
