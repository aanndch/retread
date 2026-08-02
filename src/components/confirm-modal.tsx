import { useRef, useEffect } from 'preact/hooks';
import { Button } from './button';
import { CloseIcon } from './icons';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }: ConfirmModalProps) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    // Defer focus to ensure DOM is painted
    requestAnimationFrame(() => {
      const btn = document.querySelector('.modal-content .btn-danger-text') as HTMLElement | null;
      btn?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
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
    <div class="modal-backdrop" onClick={onCancel}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{title}</h3>
          <Button variant="icon" aria-label="Close" onClick={onCancel}>
            <CloseIcon />
          </Button>
        </div>
        <div class="settings-body" style={{ padding: 'var(--spacing-md) 0' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-ink-muted)', lineHeight: '1.5' }}>
            {message}
          </p>
          <div class="page-action-row page-action-modal">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <button
              type="button"
              class="btn btn-primary btn-danger-text"
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
