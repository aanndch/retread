import { useRef, useEffect, useState } from 'preact/hooks';
import { Button } from './button';
import { CloseIcon } from './icons';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useExitFade } from './use-exit-fade';
import { useOverlayFocus } from './use-overlay-focus';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  // Renders the confirm button as a solid red destructive action (deletes).
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }: ConfirmModalProps) {
  // Confirms mount only while visible — lock the page scroll behind them.
  useBodyScrollLock(true);
  const contentRef = useRef<HTMLDivElement>(null);
  // A close is a fade-then-act: the envelope's exit fade (--motion-base) plays
  // first, and the pending action — which unmounts us — runs when it completes.
  const pendingRef = useRef<(() => void) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { visible, closing } = useExitFade(!leaving);
  useOverlayFocus(visible, contentRef);

  const handleClose = (action: () => void) => {
    if (pendingRef.current) return;
    pendingRef.current = action;
    setLeaving(true);
  };

  // When the exit fade finishes, run the pending action (which unmounts us).
  useEffect(() => {
    if (!visible && pendingRef.current) pendingRef.current();
  }, [visible]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') handleClose(onCancel);
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div class={`modal-backdrop${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={() => handleClose(onCancel)}>
      <div ref={contentRef} class={`modal-content${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{title}</h3>
          <Button variant="icon" aria-label="Close" onClick={() => handleClose(onCancel)}>
            <CloseIcon />
          </Button>
        </div>
        <div class="modal-body-compact">
          <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', lineHeight: '1.5' }}>
            {message}
          </p>
          <div class="page-action-row page-action-modal">
            <Button variant="secondary" onClick={() => handleClose(onCancel)}>
              Cancel
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={() => handleClose(onConfirm)}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
