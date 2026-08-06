import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { FieldCard } from '../../components/field-card';
import { StepActions } from './fields';

interface StoryStepProps {
  note: string;
  setNote: (n: string) => void;
  step: 1 | 2 | 3 | 4;
  handleStepJump: (s: 1 | 2 | 3 | 4) => void;
  saveLabel: string;
  saving: boolean;
}

export function StoryStep({
  note,
  setNote,
  step,
  handleStepJump,
  saveLabel,
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
      <FieldCard label="Leg Note">
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
      </FieldCard>

      <StepActions
        onBack={() => handleStepJump((step - 1) as 1 | 2 | 3 | 4)}
        backDisabled={saving}
        submit
        nextLabel={saving ? 'Saving…' : saveLabel}
        nextDisabled={saving}
      />
    </div>
  );
}
