import { useState, useEffect } from 'preact/hooks';
import { Setup } from './ui/setup';
import { Home } from './ui/home';
import { TestRunner } from './ui/test-runner';

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
      return (
        <div class="placeholder-view">
          <h3>Trip Journal (ID: {tripId})</h3>
          <p class="placeholder-text">v1 Trip Detail Screen is under construction.</p>
          <button class="btn btn-secondary btn-sm" onClick={() => navigateTo('#/')}><- Back Home</button>
        </div>
      );
    }

    if (hash.startsWith('#/page/')) {
      const pageId = hash.split('/').pop();
      return (
        <div class="placeholder-view">
          <h3>Page Detail (ID: {pageId})</h3>
          <p class="placeholder-text">v1 Page Detail Screen is under construction.</p>
          <button class="btn btn-secondary btn-sm" onClick={() => navigateTo('#/')}><- Back Home</button>
        </div>
      );
    }

    if (hash.startsWith('#/edit')) {
      return (
        <div class="placeholder-view">
          <h3>Editor Form</h3>
          <p class="placeholder-text">v1 Page Editor is under construction.</p>
          <button class="btn btn-secondary btn-sm" onClick={() => navigateTo('#/')}><- Back Home</button>
        </div>
      );
    }

    if (hash === '#/backup') {
      return (
        <div class="placeholder-view">
          <h3>Backup & Restore Settings</h3>
          <p class="placeholder-text">v1 Backup Engine is under construction.</p>
          <button class="btn btn-secondary btn-sm" onClick={() => navigateTo('#/')}><- Back Home</button>
        </div>
      );
    }

    // Fallback 404
    return (
      <div class="placeholder-view">
        <h3>Page Not Found</h3>
        <button class="btn btn-secondary btn-sm" onClick={() => navigateTo('#/')}><- Back Home</button>
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
