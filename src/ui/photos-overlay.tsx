import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../components/button';
import { CloseIcon } from '../components/icons';
import { useBodyScrollLock } from '../components/use-body-scroll-lock';
import { useExitFade } from '../components/use-exit-fade';
import { galleryPhotoId, type GalleryPhoto } from './use-gallery-photos';

interface PhotosOverlayProps {
  isOpen: boolean;
  photos: GalleryPhoto[];
  activePhotoId: string | null;
  onClose: () => void;
  onActiveChange: (photoId: string) => void;
  onViewRide: (route: string) => void;
}

// Paper-styled lightbox for the gallery, hosted at the App shell so it survives
// navigation: the photo is the hero on a paper ground with a minimal caption
// (which ride · where in the stream) and two actions — View ride and Close.
// The active photo is resolved by identity, so "View ride" -> Back restores
// the exact photo even after the wall is reshuffled.
export function PhotosOverlay({
  isOpen,
  photos,
  activePhotoId,
  onClose,
  onActiveChange,
  onViewRide,
}: PhotosOverlayProps) {
  const touchStartX = useRef(0);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Play a short fade-out when the overlay closes so it never cuts to a blank
  // frame; keep the page scroll locked until the fade completes.
  const { visible, closing } = useExitFade(isOpen);
  useBodyScrollLock(visible);

  const activeIdx = Math.max(
    0,
    photos.findIndex((p) => galleryPhotoId(p) === activePhotoId)
  );
  const active = photos[activeIdx];

  // Full-size object URL for the active photo only, so the wall never holds
  // hundreds of full-size URLs in memory at once. Keyed on `visible` so the
  // photo stays in the frame during the exit fade.
  const [fullUrl, setFullUrl] = useState('');
  useEffect(() => {
    if (!visible || photos.length === 0) return;
    const blob = active?.leg.photos?.[active?.photoIndex ?? 0];
    if (!blob) {
      setFullUrl('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setFullUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [visible, activeIdx, photos, active]);

  // Dialog semantics: Escape closes, and focus moves to the close button.
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible || photos.length === 0) return null;

  const step = (dir: 1 | -1) => {
    const next = (activeIdx + dir + photos.length) % photos.length;
    onActiveChange(galleryPhotoId(photos[next]));
  };

  return (
    <div class={`photo-paper-backdrop${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
      <button
        type="button"
        ref={closeBtnRef}
        class="btn-close-overlay"
        aria-label="Close photo"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <CloseIcon size={16} />
      </button>

      <div
        class="photo-paper-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e: TouchEvent) => {
          touchStartX.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e: TouchEvent) => {
          const delta = touchStartX.current - e.changedTouches[0].clientX;
          if (Math.abs(delta) > 50) step(delta > 0 ? 1 : -1);
        }}
      >
        <div class="photo-paper-frame">
          {fullUrl && (
            <img src={fullUrl} alt={active?.ride.title || 'Ride photograph'} class="photo-paper-img" />
          )}
        </div>
      </div>

      <div class="photo-paper-footer" onClick={(e) => e.stopPropagation()}>
        <span class="photo-paper-counter">
          Photo {activeIdx + 1} / {photos.length}
        </span>
        <Button variant="secondary" size="sm" onClick={() => active && onViewRide(`#/ride/${active.ride.id}`)}>
          View ride
        </Button>
      </div>
    </div>
  );
}
