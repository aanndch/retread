import { useRef, useEffect, useState } from 'preact/hooks';
import { Button } from './button';
import { CloseIcon } from './icons';
import type { ComponentChildren } from 'preact';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useExitFade } from './use-exit-fade';
import { useOverlayFocus } from './use-overlay-focus';

interface InfoModalProps {
  title: string;
  children: ComponentChildren;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

export function InfoModal({ title, children, actionLabel, onAction, onClose }: InfoModalProps) {
  // Info modals mount only while visible — lock the page scroll behind them.
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
    if (e.key === 'Escape') handleClose(() => onClose());
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div class={`modal-backdrop${closing ? ' closing' : ''}`} onClick={() => handleClose(() => onClose())}>
      <div ref={contentRef} class={`modal-content${closing ? ' closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h3>{title}</h3>
          <Button variant="icon" aria-label="Close" onClick={() => handleClose(() => onClose())}>
            <CloseIcon />
          </Button>
        </div>
        <div class="modal-body-compact">
          <div class="info-modal-body">
            {children}
          </div>
          <div class="page-action-row page-action-modal">
            {onAction && actionLabel ? (
              <Button variant="primary" onClick={() => handleClose(onAction)}>
                {actionLabel}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => handleClose(() => onClose())}>
                Got It
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
