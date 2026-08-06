import { useState, useEffect, useRef } from 'preact/hooks';
import { Button } from './button';
import { useExitFade } from './use-exit-fade';
import { useOverlayFocus } from './use-overlay-focus';

interface PhotoArrangeSheetProps {
  isOpen: boolean;
  photoUrls: string[];
  onSave: (order: number[]) => void;
  onClose: () => void;
}

// Shared photo-reorder sheet used by the leg page and the editor photos step.
// photoUrls are the previews in their current display order; the draft holds
// indices into that original order so the caller can reindex its arrays.
export function PhotoArrangeSheet({ isOpen, photoUrls, onSave, onClose }: PhotoArrangeSheetProps) {
  const [draft, setDraft] = useState<number[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Overlay envelope: the URL owns open/close (isOpen), so closing is a plain
  // onClose() — useExitFade keeps us mounted through the --motion-base fade-out.
  const { visible, closing } = useExitFade(isOpen);
  useOverlayFocus(visible, sheetRef);

  // Escape closes the sheet (focus lands inside via useOverlayFocus).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Seed the draft when the sheet opens (photoUrls is the current order).
  if (visible && draft.length === 0) {
    setDraft(photoUrls.map((_, i) => i));
  }

  if (!visible) return null;

  const move = (position: number, direction: -1 | 1) => {
    const target = position + direction;
    if (target < 0 || target >= draft.length) return;
    setDraft((d) => {
      const next = [...d];
      [next[position], next[target]] = [next[target], next[position]];
      return next;
    });
  };

  return (
    <div class={`modal-backdrop arrange-backdrop${closing ? ' closing' : ''}`} onClick={onClose}>
      <div
        ref={sheetRef}
        tabIndex={-1}
        class={`arrange-sheet${closing ? ' closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="arrange-sheet-header">
          <span class="note-label">Arrange Photos</span>
        </div>
        <div class="arrange-list">
          {draft.map((originalIdx, position) => (
            <div key={originalIdx} class="arrange-item">
              <img src={photoUrls[originalIdx]} alt={`Photo ${position + 1}`} class="arrange-thumb" />
              <span class="arrange-index">{String(position + 1).padStart(2, "0")}</span>
              <div class="arrange-moves">
                <button
                  type="button"
                  class="btn-photo-move"
                  aria-label="Move earlier"
                  disabled={position === 0}
                  onClick={() => move(position, -1)}
                >&uarr;</button>
                <button
                  type="button"
                  class="btn-photo-move"
                  aria-label="Move later"
                  disabled={position === draft.length - 1}
                  onClick={() => move(position, 1)}
                >&darr;</button>
              </div>
            </div>
          ))}
        </div>
        <div class="arrange-actions">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => onSave(draft)}>
            Save Order
          </Button>
        </div>
      </div>
    </div>
  );
}
