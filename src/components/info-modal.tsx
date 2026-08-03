import { useRef, useEffect, useState } from 'preact/hooks';
import { Button } from './button';
import { CloseIcon } from './icons';
import type { ComponentChildren } from 'preact';

interface InfoModalProps {
  title: string;
  children: ComponentChildren;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

export function InfoModal({ title, children, actionLabel, onAction, onClose }: InfoModalProps) {
  const [closing, setClosing] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);

  const handleClose = (action: () => void) => {
    setClosing(true);
    setTimeout(action, 180);
  };

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    requestAnimationFrame(() => {
      const btn = document.querySelector('.modal-content .btn-primary') as HTMLElement | null;
      btn?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
    <div class={`modal-backdrop${closing ? ' closing' : ''}`} onClick={() => handleClose(onClose)}>
      <div class={`modal-content${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{title}</h3>
          <Button variant="icon" aria-label="Close" onClick={() => handleClose(onClose)}>
            <CloseIcon />
          </Button>
        </div>
        <div class="settings-body" style={{ padding: 'var(--spacing-md) 0' }}>
          <div class="info-modal-body">
            {children}
          </div>
          <div class="page-action-row page-action-modal">
            {onAction && actionLabel ? (
              <Button variant="primary" onClick={() => handleClose(onAction)}>
                {actionLabel}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => handleClose(onClose)}>
                Got It
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
