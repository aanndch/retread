import { useState, useRef, useEffect, useCallback } from 'preact/hooks';

interface PhotoOverlayProps {
  isOpen: boolean;
  photoUrls: string[];
  activeIdx: number;
  setActiveIdx: (idx: number | ((i: number) => number)) => void;
  onClose: () => void;
  onSetCover?: (idx: number) => void;
}

export function PhotoOverlay({
  isOpen,
  photoUrls,
  activeIdx,
  setActiveIdx,
  onClose,
  onSetCover,
}: PhotoOverlayProps) {
  const [imgScale, setImgScale] = useState(1);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);
  const photoTouchStart = useRef({ x: 0, y: 0 });
  const photoLastTouchDistance = useRef<number | null>(null);
  const touchStartX = useRef(0);
  const isPhotoDraggingRef = useRef(false);
  const imgScaleRef = useRef(1);

  // Reset zoom state when overlay opens
  useEffect(() => {
    if (isOpen) {
      setImgScale(1);
      imgScaleRef.current = 1;
      setImgOffset({ x: 0, y: 0 });
      setIsPhotoDragging(false);
      isPhotoDraggingRef.current = false;
    }
  }, [isOpen]);

  // Close modal when hardware back button is pressed
  useEffect(() => {
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  // Dialog semantics: Escape closes, and focus moves to the close button.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || photoUrls.length === 0) return null;

  const togglePhotoZoom = (e: MouseEvent) => {
    e.stopPropagation();
    if (imgScale > 1) {
      setImgScale(1);
      imgScaleRef.current = 1;
      setImgOffset({ x: 0, y: 0 });
    } else {
      setImgScale(2.5);
      imgScaleRef.current = 2.5;
    }
  };

  const handlePhotoTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      isPhotoDraggingRef.current = true;
      setIsPhotoDragging(true);
      photoTouchStart.current = {
        x: e.touches[0].clientX - imgOffset.x,
        y: e.touches[0].clientY - imgOffset.y,
      };
      touchStartX.current = e.touches[0].clientX;
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      photoLastTouchDistance.current = dist;
    }
  };

  const handlePhotoTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && isPhotoDraggingRef.current && imgScaleRef.current > 1) {
      const dx = e.touches[0].clientX - photoTouchStart.current.x;
      const dy = e.touches[0].clientY - photoTouchStart.current.y;
      setImgOffset({ x: dx, y: dy });
    } else if (e.touches.length === 2 && photoLastTouchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / photoLastTouchDistance.current;
      const newScale = Math.max(1, Math.min(4, imgScaleRef.current * factor));
      imgScaleRef.current = newScale;
      setImgScale(newScale);
      photoLastTouchDistance.current = dist;
    }
  };

  const handlePhotoTouchEnd = (e: TouchEvent) => {
    isPhotoDraggingRef.current = false;
    setIsPhotoDragging(false);
    photoLastTouchDistance.current = null;

    // Swipe navigation when not zoomed in
    if (imgScaleRef.current === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(deltaX) > 50) {
        if (deltaX < 0) {
          setActiveIdx((i) => (i + 1) % photoUrls.length);
        } else {
          setActiveIdx((i) => (i - 1 + photoUrls.length) % photoUrls.length);
        }
      }
    }
  };

  const handlePhotoMouseMove = useCallback((e: MouseEvent) => {
    if (isPhotoDraggingRef.current && imgScaleRef.current > 1) {
      const dx = e.clientX - photoTouchStart.current.x;
      const dy = e.clientY - photoTouchStart.current.y;
      setImgOffset({ x: dx, y: dy });
    }
  }, []);

  const handlePhotoMouseUp = useCallback(() => {
    if (isPhotoDraggingRef.current) {
      isPhotoDraggingRef.current = false;
      setIsPhotoDragging(false);
      document.removeEventListener('mousemove', handlePhotoMouseMove);
      document.removeEventListener('mouseup', handlePhotoMouseUp);
    }
  }, [handlePhotoMouseMove]);

  const handlePhotoMouseDown = (e: MouseEvent) => {
    isPhotoDraggingRef.current = true;
    setIsPhotoDragging(true);
    photoTouchStart.current = {
      x: e.clientX - imgOffset.x,
      y: e.clientY - imgOffset.y,
    };
    document.addEventListener('mousemove', handlePhotoMouseMove);
    document.addEventListener('mouseup', handlePhotoMouseUp);
  };

  return (
    <div class="modal-backdrop photo-overlay-backdrop" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={onClose}>
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
        &times;
      </button>

      <div
        class="photo-zoom-container"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handlePhotoTouchStart}
        onTouchMove={handlePhotoTouchMove}
        onTouchEnd={handlePhotoTouchEnd}
        onMouseDown={handlePhotoMouseDown}
      >
        <img
          src={photoUrls[activeIdx]}
          alt={`Photo overlay ${activeIdx + 1}`}
          class="photo-zoom-image"
          style={{
            transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${imgScale})`,
            transition: isPhotoDragging ? 'none' : 'transform 0.15s ease-out',
          }}
          onDblClick={togglePhotoZoom}
        />
      </div>

      <div class="photo-overlay-bar" onClick={(e) => e.stopPropagation()}>
        <span class="photo-overlay-counter">
          PHOTO {String(activeIdx + 1).padStart(2, "0")} / {String(photoUrls.length).padStart(2, "0")}
        </span>
        {onSetCover && (
          <button type="button" class="btn-overlay-cover" onClick={() => onSetCover(activeIdx)}>
            ★ Set as ride cover
          </button>
        )}
      </div>
    </div>
  );
}
