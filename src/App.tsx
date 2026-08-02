import { useState, useEffect } from 'preact/hooks';
import { TestRunner } from './ui/test-runner';

export function App() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return (
    <div class="app-container">
      <main class="viewport">
        {currentHash === '#/test' ? (
          <TestRunner />
        ) : (
          <>
            <header>
              <h1 class="logo">retread</h1>
              <p class="tagline">A journal for well-tread journeys.</p>
            </header>
            <section class="placeholder-section">
              <p>Initialization complete. Retread workspace is ready.</p>
              <p style={{ marginTop: '16px' }}>
                <a href="#/test" style={{ color: 'var(--color-green)', textDecoration: 'underline', fontWeight: 'bold' }}>
                  Run Core System Integration Tests &rarr;
                </a>
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
