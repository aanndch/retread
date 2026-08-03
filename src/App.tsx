import { useState, useEffect, useCallback } from 'preact/hooks';
import { Setup } from './ui/setup';
import { PWAInstallPrompt, IOSBackupReminder, useAppPrompts } from './components/app-prompts';
import { Home } from './ui/home';
import { TestRunner } from './ui/test-runner';
import { Editor } from './ui/editor';
import { Backup } from './ui/backup';
import { TripDetail } from './ui/trip-detail';
import { PageDetail } from './ui/page-detail';
import {
  HASH_HOME,
  HASH_BACKUP,
  HASH_EDIT,
  HASH_TRIP_PREFIX,
  HASH_PAGE_PREFIX,
} from './constants';
import { getSWUpdate } from './main';

export function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasSWUpdate, setHasSWUpdate] = useState(false);
  const appPrompt = useAppPrompts();
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const activePrompt = dismissedPrompt ? null : appPrompt;

  // Check setup status and monitor hash changes
  useEffect(() => {
    const isSetup = localStorage.getItem('retread-setup-complete') === 'true';
    setSetupComplete(isSetup);

    const handleHashChange = () => {
      const checkedSetup = localStorage.getItem('retread-setup-complete') === 'true';
      setSetupComplete(checkedSetup);

      // Trigger fade-out transition
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentHash(window.location.hash);
        setIsTransitioning(false);
      }, 100);
    };

    const handleSWUpdate = () => setHasSWUpdate(true);

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('sw-update', handleSWUpdate);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('sw-update', handleSWUpdate);
    };
  }, []);

  const navigateTo = useCallback((route: string) => {
    window.location.hash = route;
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
      return <Home onNavigate={navigateTo} />;
    }
    
    if (hash === '#/test') {
      if (import.meta.env.DEV) {
        return <TestRunner />;
      }
      return <Home onNavigate={navigateTo} />;
    }
    
    if (hash.startsWith(HASH_TRIP_PREFIX)) {
      const tripId = hash.split('/').pop();
      const parsedId = tripId ? parseInt(tripId, 10) : NaN;
      if (isNaN(parsedId)) return <Home onNavigate={navigateTo} />;
      return <TripDetail tripId={parsedId} onNavigate={navigateTo} />;
    }

    if (hash.startsWith(HASH_PAGE_PREFIX)) {
      const pageId = hash.split('/').pop();
      const parsedId = pageId ? parseInt(pageId, 10) : NaN;
      if (isNaN(parsedId)) return <Home onNavigate={navigateTo} />;
      return <PageDetail pageId={parsedId} onNavigate={navigateTo} />;
    }

    if (hash.startsWith(HASH_EDIT)) {
      return <Editor onNavigate={navigateTo} />;
    }

    if (hash === HASH_BACKUP) {
      return <Backup onNavigate={navigateTo} />;
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
      <main class={`viewport${isTransitioning ? ' page-exit' : ''}`}>
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
