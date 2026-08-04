import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { SquiggleMap } from '../ui/squiggle';
import type { SquiggleSegment, SquiggleStop } from '../ui/squiggle';
import { CloseIcon } from './icons';

interface MapModalProps {
  isOpen: boolean;
  path?: { lat: number; lng: number }[];
  segments?: SquiggleSegment[];
  stops?: SquiggleStop[];
  compass?: boolean;
  caption?: string;
  onClose: () => void;
}

export function MapModal({ isOpen, path, segments, stops, compass, caption, onClose }: MapModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [closing, setClosing] = useState(false);
  const zoomInnerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const mapTouchStart = useRef({ x: 0, y: 0 });
  const mapLastTouchDistance = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const handleClose = (action: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      action();
    }, 250);
  };

  useEffect(() => {
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  // Dialog semantics: Escape closes, and focus moves to the close button so
  // keyboard users land inside the dialog instead of losing focus to the page.
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose(onClose);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    closeBtnRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const updateTransform = useCallback(() => {
    if (!zoomInnerRef.current) return;
    const el = zoomInnerRef.current;
    el.style.transform = `translate(${offsetRef.current.x}px, ${offsetRef.current.y}px) scale(${scaleRef.current})`;
  }, []);

  const toggleMapZoom = (e: MouseEvent) => {
    e.stopPropagation();
    if (scaleRef.current > 1) {
      scaleRef.current = 1;
      offsetRef.current = { x: 0, y: 0 };
      setIsZoomed(false);
    } else {
      scaleRef.current = 2.5;
      setIsZoomed(true);
    }
    if (zoomInnerRef.current) {
      zoomInnerRef.current.style.transition = 'transform 0.15s ease-out';
      updateTransform();
    }
  };

  const handleMapTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      setIsDragging(true);
      mapTouchStart.current = {
        x: e.touches[0].clientX - offsetRef.current.x,
        y: e.touches[0].clientY - offsetRef.current.y,
      };
      if (zoomInnerRef.current) zoomInnerRef.current.style.transition = 'none';
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      mapLastTouchDistance.current = dist;
      if (zoomInnerRef.current) zoomInnerRef.current.style.transition = 'none';
    }
  };

  const handleMapTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      offsetRef.current = {
        x: e.touches[0].clientX - mapTouchStart.current.x,
        y: e.touches[0].clientY - mapTouchStart.current.y,
      };
      updateTransform();
    } else if (e.touches.length === 2 && mapLastTouchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / mapLastTouchDistance.current;
      scaleRef.current = Math.max(1, Math.min(4, scaleRef.current * factor));
      mapLastTouchDistance.current = dist;
      setIsZoomed(scaleRef.current > 1);
      updateTransform();
    }
  };

  const handleMapTouchEnd = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    mapLastTouchDistance.current = null;
  };

  const handleMapMouseMove = useCallback((e: MouseEvent) => {
    if (isDraggingRef.current) {
      offsetRef.current = {
        x: e.clientX - mapTouchStart.current.x,
        y: e.clientY - mapTouchStart.current.y,
      };
      updateTransform();
    }
  }, [updateTransform]);

  const handleMapMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMapMouseMove);
      document.removeEventListener('mouseup', handleMapMouseUp);
    }
  }, [handleMapMouseMove]);

  const handleMapMouseDown = (e: MouseEvent) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    mapTouchStart.current = {
      x: e.clientX - offsetRef.current.x,
      y: e.clientY - offsetRef.current.y,
    };
    if (zoomInnerRef.current) zoomInnerRef.current.style.transition = 'none';
    document.addEventListener('mousemove', handleMapMouseMove);
    document.addEventListener('mouseup', handleMapMouseUp);
  };

  if (!isOpen) return null;

  return (
    <div class={`modal-backdrop map-overlay-backdrop${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label="Route map" onClick={() => handleClose(onClose)}>
      <button 
        type="button" 
        ref={closeBtnRef}
        class="btn-close-overlay" 
        aria-label="Close map" 
        onClick={(e) => { e.stopPropagation(); handleClose(onClose); }}
      >
        <CloseIcon size={16} />
      </button>
      
      <div 
        class="map-zoom-container"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleMapTouchStart}
        onTouchMove={handleMapTouchMove}
        onTouchEnd={handleMapTouchEnd}
        onMouseDown={handleMapMouseDown}
      >
        <div 
          ref={zoomInnerRef}
          class="map-zoom-inner"
          style={{
            width: '90vw',
            height: '70vh',
            maxWidth: '440px',
            maxHeight: '440px'
          }}
          onDblClick={toggleMapZoom}
        >
          <SquiggleMap
            path={path}
            segments={segments}
            stops={stops}
            width={400}
            height={400}
            hideWrapper
            hideGrid
            skipFilter={isDragging || isZoomed}
            compass={compass}
            caption={caption}
          />
        </div>
      </div>
    </div>
  );
}
