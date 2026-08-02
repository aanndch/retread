import { useState, useEffect } from 'preact/hooks';
import { Setup } from './ui/setup';
import { Home } from './ui/home';
import { TestRunner } from './ui/test-runner';
import { Editor } from './ui/editor';
import { Backup } from './ui/backup';
import { TripDetail } from './ui/trip-detail';
import { PageDetail } from './ui/page-detail';

export function App() {
  const [setupComplete, setSetupComplete] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  // Check setup status and monitor hash changes
  useEffect(() => {
    const isSetup = localStorage.getItem('retread-setup-complete') === 'true';
    setSetupComplete(isSetup);

    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
      const checkedSetup = localStorage.getItem('retread-setup-complete') === 'true';
      setSetupComplete(checkedSetup);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigateTo = (route: string) => {
    window.location.hash = route;
  };

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
    const hash = currentHash || '#/';

    if (hash === '#/' || hash === '') {
      return <Home onNavigate={navigateTo} />;
    }
    
    if (hash === '#/test') {
      return <TestRunner />;
    }
    
    if (hash.startsWith('#/trip/')) {
      const tripId = hash.split('/').pop();
      const parsedId = tripId ? parseInt(tripId, 10) : NaN;
      if (isNaN(parsedId)) return <Home onNavigate={navigateTo} />;
      return <TripDetail tripId={parsedId} onNavigate={navigateTo} />;
    }

    if (hash.startsWith('#/page/')) {
      const pageId = hash.split('/').pop();
      const parsedId = pageId ? parseInt(pageId, 10) : NaN;
      if (isNaN(parsedId)) return <Home onNavigate={navigateTo} />;
      return <PageDetail pageId={parsedId} onNavigate={navigateTo} />;
    }

    if (hash.startsWith('#/edit')) {
      return <Editor onNavigate={navigateTo} />;
    }

    if (hash === '#/backup') {
      return <Backup onNavigate={navigateTo} />;
    }

    // Fallback 404
    return (
      <div class="placeholder-view">
        <h3>Page Not Found</h3>
        <button class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 4px;" onClick={() => navigateTo('#/')}>
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
      <main class="viewport">
        {renderRoute()}
      </main>
    </div>
  );
}
