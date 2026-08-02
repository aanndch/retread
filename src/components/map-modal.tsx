import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { SquiggleMap } from '../ui/squiggle';

interface MapModalProps {
  isOpen: boolean;
  path: { lat: number; lng: number }[];
  onClose: () => void;
}

export function MapModal({ isOpen, path, onClose }: MapModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const zoomInnerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const mapTouchStart = useRef({ x: 0, y: 0 });
  const mapLastTouchDistance = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const handlePopState = () => onClose();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

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
    <div class="modal-backdrop map-overlay-backdrop" onClick={onClose}>
      <button 
        type="button" 
        class="btn-close-overlay" 
        aria-label="Close map" 
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        &times;
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
          <SquiggleMap path={path} width={400} height={400} hideWrapper hideGrid skipFilter={isDragging || isZoomed} />
        </div>
      </div>
    </div>
  );
}
