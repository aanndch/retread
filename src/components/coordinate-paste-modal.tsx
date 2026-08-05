import { useState, useEffect, useRef } from 'preact/hooks';
import { Button } from './button';
import { parseCoordinates } from '../ui/editor/utils';

interface CoordinatePasteModalProps {
  isOpen: boolean;
  targetLabel: string;
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
}

// Offline fallback for pinning a location: the map needs a network, so when the
// picker is blocked we let the user paste raw coordinates (or a Google Maps
// link) instead — parseCoordinates handles both formats.
export function CoordinatePasteModal({ isOpen, targetLabel, onConfirm, onClose }: CoordinatePasteModalProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setError('');
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submit = () => {
    const coords = parseCoordinates(value);
    if (!coords) {
      setError("Couldn't read coordinates. Paste like 31.2245, 77.3456 or a Google Maps link.");
      return;
    }
    onConfirm(coords.lat, coords.lng);
    onClose();
  };

  return (
    <div class="modal-backdrop" style={{ zIndex: 3000 }} onClick={onClose}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '360px' }}>
        <div class="modal-header">
          <h3>Paste Coordinates</h3>
          <button type="button" class="btn-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div style={{ padding: '0 var(--spacing-md) var(--spacing-md)' }}>
          <p style={{ fontSize: '12px', color: 'var(--color-ink-muted)', fontFamily: 'var(--font-typewriter)', marginTop: 0 }}>
            Offline you can still set the {targetLabel.toLowerCase()} — paste
            coordinates like <strong>31.2245, 77.3456</strong> or a Google Maps share link.
          </p>
          <input
            ref={inputRef}
            type="text"
            class="form-input"
            aria-label="Coordinates"
            placeholder="e.g. 31.2245, 77.3456"
            value={value}
            onInput={(e) => { setValue((e.target as HTMLInputElement).value); if (error) setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          />
          {error && <span class="error-text">{error}</span>}
          <div class="page-action-row page-action-modal" style={{ marginTop: 'var(--spacing-md)' }}>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submit}>
              Use Coordinates
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
