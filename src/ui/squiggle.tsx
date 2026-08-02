import { useMemo } from 'preact/hooks';

interface SquiggleMapProps {
  path: { lat: number; lng: number }[];
  width?: number;
  height?: number;
  hideWrapper?: boolean;
  hideGrid?: boolean;
  skipFilter?: boolean;
}

function simplifyPath(pts: { lat: number; lng: number }[], maxPoints: number): { lat: number; lng: number }[] {
  if (pts.length <= maxPoints) return pts;

  const sqSegDist = (p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    let x = a.lng, y = a.lat;
    let dx = b.lng - x, dy = b.lat - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.lng - x) * dx + (p.lat - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b.lng; y = b.lat; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p.lng - x;
    dy = p.lat - y;
    return dx * dx + dy * dy;
  };

  // Simple Douglas-Peucker: keep endpoints, recursively keep farthest points
  const keep = new Set<number>([0, pts.length - 1]);

  const recurse = (start: number, end: number) => {
    if (end - start < 2) return;
    let maxSqDist = 0;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const d = sqSegDist(pts[i], pts[start], pts[end]);
      if (d > maxSqDist) {
        maxSqDist = d;
        maxIdx = i;
      }
    }
    if (maxIdx !== start && maxIdx !== end) {
      keep.add(maxIdx);
      recurse(start, maxIdx);
      recurse(maxIdx, end);
    }
  };

  recurse(0, pts.length - 1);

  // If still too many points, sample evenly from kept points
  const kept = Array.from(keep).sort((a, b) => a - b).map(i => pts[i]);
  if (kept.length <= maxPoints) return kept;

  const step = Math.ceil(kept.length / maxPoints);
  return kept.filter((_, i) => i % step === 0 || i === kept.length - 1);
}

export function SquiggleMap({ 
  path, 
  width = 300, 
  height = 150, 
  hideWrapper = false, 
  hideGrid = false,
  skipFilter = false
}: SquiggleMapProps) {
  const simplified = useMemo(() => {
    if (!path || path.length < 2) return [];
    return simplifyPath(path, 200);
  }, [path]);

  const { pathD, startPt, endPt } = useMemo(() => {
    if (simplified.length < 2) return { pathD: '', startPt: null, endPt: null };

    const lats = simplified.map(p => p.lat);
    const lngs = simplified.map(p => p.lng);
    
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (let i = 0; i < lats.length; i++) {
      if (lats[i] < minLat) minLat = lats[i];
      if (lats[i] > maxLat) maxLat = lats[i];
      if (lngs[i] < minLng) minLng = lngs[i];
      if (lngs[i] > maxLng) maxLng = lngs[i];
    }

    const padding = 8;
    const latSpan = Math.max(maxLat - minLat, 0.0001);
    const lngSpan = Math.max(maxLng - minLng, 0.0001);

    const scaleX = (width - 2 * padding) / lngSpan;
    const scaleY = (height - 2 * padding) / latSpan;
    const scale = Math.min(scaleX, scaleY);

    const xOffset = (width - lngSpan * scale) / 2;
    const yOffset = (height - latSpan * scale) / 2;

    const points2D = simplified.map(p => ({
      x: xOffset + (p.lng - minLng) * scale,
      y: yOffset + (maxLat - p.lat) * scale,
    }));

    let d = `M ${points2D[0].x} ${points2D[0].y}`;
    for (let i = 0; i < points2D.length - 1; i++) {
      const p0 = points2D[i];
      const p1 = points2D[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y + (p1.y - p0.y) / 3;
      const cpX2 = p0.x + (2 * (p1.x - p0.x)) / 3;
      const cpY2 = p0.y + (2 * (p1.y - p0.y)) / 3;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    return {
      pathD: d,
      startPt: points2D[0],
      endPt: points2D[points2D.length - 1],
    };
  }, [simplified, width, height]);

  if (!path || path.length < 2) {
    return (
      <div class="squiggle-map-empty">
        <span class="empty-icon">🗺</span>
        <p>No map path available.</p>
      </div>
    );
  }

  const filterAttr = skipFilter ? undefined : 'url(#hand-drawn-wobble)';

  const svgContent = (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${width} ${height}`} 
      class="squiggle-map-svg"
      xmlns="http://www.w3.org/2000/svg"
    >
      {!skipFilter && (
        <defs>
          <filter id="hand-drawn-wobble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      )}

      {!hideGrid && (
        <g class="map-grid-lines">
          <line x1="0" y1="50" x2={width} y2="50" stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="0" y1="100" x2={width} y2="100" stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="100" y1="0" x2="100" y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="200" y1="0" x2="200" y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
        </g>
      )}

      {pathD && (
        <>
          <path 
            d={pathD} 
            fill="none" 
            stroke="var(--color-ink)" 
            stroke-width="5" 
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.12"
            filter={filterAttr}
          />
          <path 
            d={pathD} 
            fill="none" 
            stroke="var(--color-ink)" 
            stroke-width="2" 
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.9"
            filter={filterAttr}
            class={skipFilter ? undefined : 'map-route-path'}
          />
        </>
      )}

      {startPt && (
        <g filter={filterAttr}>
          <circle 
            cx={startPt.x} 
            cy={startPt.y} 
            r="3.5" 
            fill="var(--color-ink)" 
          />
        </g>
      )}

      {endPt && (() => {
        const cx = endPt.x;
        const cy = endPt.y;
        const r = 4.5;
        return (
          <g filter={filterAttr}>
            <line 
              x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} 
              stroke="var(--color-green)" stroke-width="2.5" stroke-linecap="round"
            />
            <line 
              x1={cx + r} y1={cy - r} x2={cx - r} y2={cy + r} 
              stroke="var(--color-green)" stroke-width="2.5" stroke-linecap="round"
            />
          </g>
        );
      })()}
    </svg>
  );

  if (hideWrapper) return svgContent;

  return (
    <div class="squiggle-map-wrapper">
      {svgContent}
    </div>
  );
}
