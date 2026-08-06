import { useEffect, useRef, useState } from 'preact/hooks';
import { Button } from '../components/button';
import { CloseIcon } from '../components/icons';
import type { GalleryPhoto } from './photos';

interface PhotosOverlayProps {
  isOpen: boolean;
  photos: GalleryPhoto[];
  activeIdx: number;
  setActiveIdx: (idx: number | ((i: number) => number)) => void;
  onClose: () => void;
  onViewRide: (rideId: number) => void;
}

// Paper-styled lightbox for the gallery: the photo is the hero on a paper
// ground, with a minimal caption (which ride · where in the stream) and two
// actions — View ride and Close. Swiping flips through the shuffled wall.
export function PhotosOverlay({
  isOpen,
  photos,
  activeIdx,
  setActiveIdx,
  onClose,
  onViewRide,
}: PhotosOverlayProps) {
  const touchStartX = useRef(0);
  const active = photos[activeIdx];

  // Full-size object URL for the active photo only, so the wall never holds
  // hundreds of full-size URLs in memory at once.
  const [fullUrl, setFullUrl] = useState('');
  useEffect(() => {
    if (!isOpen || photos.length === 0) return;
    const blob = photos[activeIdx]?.leg.photos?.[photos[activeIdx]?.photoIndex ?? 0];
    if (!blob) {
      setFullUrl('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setFullUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isOpen, activeIdx, photos]);

  if (!isOpen || photos.length === 0) return null;

  const step = (dir: 1 | -1) => {
    setActiveIdx((i) => (i + dir + photos.length) % photos.length);
  };

  return (
    <div class="photo-paper-backdrop" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
      <button
        type="button"
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
        <Button variant="secondary" size="sm" onClick={() => active && onViewRide(active.ride.id!)}>
          View ride
        </Button>
      </div>
    </div>
  );
}
