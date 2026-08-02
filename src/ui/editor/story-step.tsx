import type { JSX } from 'preact';
import { Button } from '../../components/button';

interface StoryStepProps {
  note: string;
  setNote: (n: string) => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
}

export function StoryStep({
  note,
  setNote,
  handleStepJump
}: StoryStepProps) {
  return (
    <div class="wizard-step-content">
      <div class="form-group">
        <label class="input-label">Ride Note</label>
        <textarea 
          class="form-textarea" 
          placeholder="Write a whisper about this ride... (roads, weather, vibes)"
          value={note}
          onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => setNote((e.target as HTMLTextAreaElement).value)}
          autoFocus
        ></textarea>
      </div>

      {/* Step 3 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={() => handleStepJump(2)}>
          ← Back
        </Button>
        <Button type="submit" variant="primary">
          Save Details
        </Button>
      </div>
    </div>
  );
}
