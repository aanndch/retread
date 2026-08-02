import { useState } from 'preact/hooks';
import { Button } from '../components/button';
import { ArrowRight } from '../components/icons';

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
      <p class="setup-tagline">A logbook for well-tread rides.</p>
      
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

        <Button 
          variant="primary" 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }} 
          onClick={handleStart} 
          disabled={persisting}
        >
          <span>{persisting ? 'Configuring persistent storage...' : 'Start Logging'}</span>
          {!persisting && <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}
