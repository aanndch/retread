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
            <Button variant="primary" class="btn-danger-text" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
