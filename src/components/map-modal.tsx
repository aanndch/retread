import { useState, useRef, useEffect } from 'preact/hooks';
import { SquiggleMap } from '../ui/squiggle';

interface MapModalProps {
  isOpen: boolean;
  path: { lat: number; lng: number }[];
  onClose: () => void;
}

export function MapModal({ isOpen, path, onClose }: MapModalProps) {
  if (!isOpen) return null;

  const [mapScale, setMapScale] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const mapTouchStart = useRef({ x: 0, y: 0 });
  const mapLastTouchDistance = useRef<number | null>(null);

  // Bind popstate listener inside the modal itself so hardware back button closes it!
  useEffect(() => {
    const handlePopState = () => {
      onClose();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [onClose]);

  const toggleMapZoom = (e: MouseEvent) => {
    e.stopPropagation();
    if (mapScale > 1) {
      setMapScale(1);
      setMapOffset({ x: 0, y: 0 });
    } else {
      setMapScale(2.5);
    }
  };

  const handleMapTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      mapTouchStart.current = {
        x: e.touches[0].clientX - mapOffset.x,
        y: e.touches[0].clientY - mapOffset.y,
      };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      mapLastTouchDistance.current = dist;
    }
  };

  const handleMapTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - mapTouchStart.current.x;
      const dy = e.touches[0].clientY - mapTouchStart.current.y;
      setMapOffset({ x: dx, y: dy });
    } else if (e.touches.length === 2 && mapLastTouchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / mapLastTouchDistance.current;
      setMapScale(s => Math.max(1, Math.min(4, s * factor)));
      mapLastTouchDistance.current = dist;
    }
  };

  const handleMapTouchEnd = () => {
    setIsDragging(false);
    mapLastTouchDistance.current = null;
  };

  const handleMapMouseDown = (e: MouseEvent) => {
    setIsDragging(true);
    mapTouchStart.current = {
      x: e.clientX - mapOffset.x,
      y: e.clientY - mapOffset.y,
    };
  };

  const handleMapMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - mapTouchStart.current.x;
      const dy = e.clientY - mapTouchStart.current.y;
      setMapOffset({ x: dx, y: dy });
    }
  };

  const handleMapMouseUp = () => {
    setIsDragging(false);
  };

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
        onMouseMove={handleMapMouseMove}
        onMouseUp={handleMapMouseUp}
      >
        <div 
          class="map-zoom-inner"
          style={{
            transform: `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${mapScale})`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            width: '90vw',
            height: '70vh',
            maxWidth: '440px',
            maxHeight: '440px'
          }}
          onDblClick={toggleMapZoom}
        >
          <SquiggleMap path={path} width={400} height={400} hideWrapper hideGrid />
        </div>
      </div>
    </div>
  );
}
