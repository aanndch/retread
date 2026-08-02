import { useState } from 'preact/hooks';

interface SetupProps {
  onComplete: () => void;
}

export function Setup({ onComplete }: SetupProps) {
  const [persisting, setPersisting] = useState(false);

  const handleStart = async () => {
    setPersisting(true);
    try {
      // Request persistent storage to mitigate browser storage eviction
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`Persistent storage granted: ${isPersisted}`);
      }
    } catch (e) {
      console.warn('Storage persistence request failed:', e);
    }
    
    // Save config variables
    localStorage.setItem('retread-setup-complete', 'true');
    localStorage.setItem('retread-country', 'IN');
    onComplete();
  };

  return (
    <div class="setup-container">
      <h2 class="setup-title">retread</h2>
      <p class="setup-tagline">A journal for well-tread journeys.</p>
      
      <div class="setup-card">
        <div class="input-group">
          <label class="input-label">Where do you ride?</label>
          <select class="input-select" disabled>
            <option value="IN">India (v1)</option>
          </select>
          <span class="input-help">v1 supports snapping routes and odometer units for India.</span>
        </div>

        <div class="privacy-warnings">
          <div class="warning-section">
            <span class="warning-bullet">✦</span>
            <div>
              <strong>Everything stays on this device.</strong>
              <p>No accounts, no cloud database, no background GPS trackers. You are fully offline and private.</p>
            </div>
          </div>
          
          <div class="warning-section">
            <span class="warning-bullet">✦</span>
            <div>
              <strong>Back up regularly.</strong>
              <p>Photos are stored locally in your browser's IndexedDB. To protect your memories from device loss or OS cleanup, export backups from the gear menu.</p>
            </div>
          </div>
        </div>

        <button class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px;" onClick={handleStart} disabled={persisting}>
          <span>{persisting ? 'Configuring persistent storage...' : 'Start Journaling'}</span>
          {!persisting && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <polyline points="15 5 22 12 15 19"></polyline>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
