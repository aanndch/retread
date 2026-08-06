import { useRef, useEffect, useState } from 'preact/hooks';
import { Button } from './button';
import { CloseIcon } from './icons';

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
  const [closing, setClosing] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  const handleClose = (action: () => void) => {
    setClosing(true);
    setTimeout(action, 250);
  };

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose(onCancel);
        return;
      }
      if (e.key === 'Tab') {
        const modal = document.querySelector('.modal-content');
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, []);

  return (
    <div class={`modal-backdrop${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={() => handleClose(onCancel)}>
      <div class={`modal-content${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
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
