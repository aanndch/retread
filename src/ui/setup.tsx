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
        await navigator.storage.persist();
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
      <p class="setup-tagline">For well-tread rides.</p>
      
      <div class="setup-card">
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
              <strong>Route snapping for Indian roads.</strong>
              <p>Retread measures distances along real roads using OpenStreetMap data, optimized for Indian routes.</p>
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
