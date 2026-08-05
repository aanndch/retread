import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { Button } from '../../components/button';

interface StoryStepProps {
  note: string;
  setNote: (n: string) => void;
  handleStepJump: (s: 1 | 2 | 3) => void;
  saving: boolean;
}

export function StoryStep({
  note,
  setNote,
  handleStepJump,
  saving
}: StoryStepProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea on load and value change
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [note]);

  return (
    <div class="wizard-step-content">
      <div class="step-card">
        <div class="step-card-label">Leg Note</div>
        <textarea 
          ref={textareaRef}
          class="form-textarea" 
          rows={5}
          placeholder="Write a whisper about this leg... (roads, weather, vibes)"
          value={note}
          onInput={(e: JSX.TargetedEvent<HTMLTextAreaElement>) => setNote((e.target as HTMLTextAreaElement).value)}
          autoFocus
          style={{ overflowY: 'hidden', resize: 'none' }}
        ></textarea>
      </div>

      {/* Step 3 Actions */}
      <div class="form-actions">
        <Button variant="secondary" onClick={() => handleStepJump(2)} disabled={saving}>
          ← Back
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save Details'}
        </Button>
      </div>
    </div>
  );
}
