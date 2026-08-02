interface SquiggleMapProps {
  path: { lat: number; lng: number }[];
  width?: number;
  height?: number;
}

export function SquiggleMap({ path, width = 300, height = 150 }: SquiggleMapProps) {
  if (!path || path.length < 2) {
    return (
      <div class="squiggle-map-empty">
        <span class="empty-icon">🗺</span>
        <p>No map path available.</p>
      </div>
    );
  }

  // 1. Project spherical coordinates onto a flat aspect-ratio-locked SVG viewport
  const lats = path.map(p => p.lat);
  const lngs = path.map(p => p.lng);
  
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const padding = 15;
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const maxSpan = Math.max(latSpan, lngSpan, 0.0001); // Prevent division by zero

  // Center alignment calculations inside the viewBox
  const xOffset = (width - 2 * padding - (lngSpan / maxSpan) * (width - 2 * padding)) / 2;
  const yOffset = (height - 2 * padding - (latSpan / maxSpan) * (height - 2 * padding)) / 2;

  const points2D = path.map(p => {
    const x = padding + xOffset + ((p.lng - minLng) / maxSpan) * (width - 2 * padding);
    // Invert y because SVG y goes down, while latitude goes up
    const y = padding + yOffset + ((maxLat - p.lat) / maxSpan) * (height - 2 * padding);
    return { x, y };
  });

  // 2. Generate smooth Bezier control points for the wobbly spline route
  const getSplinePath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return '';
    if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      
      // Control points for a smooth Bezier spline
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y + (p1.y - p0.y) / 3;
      const cpX2 = p0.x + (2 * (p1.x - p0.x)) / 3;
      const cpY2 = p0.y + (2 * (p1.y - p0.y)) / 3;
      
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const pathD = getSplinePath(points2D);
  const startPt = points2D[0];
  const endPt = points2D[points2D.length - 1];

  return (
    <div class="squiggle-map-wrapper">
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${width} ${height}`} 
        class="squiggle-map-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Hand-drawn pencil/ink wobbly filter */}
          <filter id="hand-drawn-wobble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        {/* Paper Grid Lines (Logbook style) */}
        <g class="map-grid-lines">
          <line x1="0" y1="50" x2={width} y2="50" stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="0" y1="100" x2={width} y2="100" stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="100" y1="0" x2="100" y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="200" y1="0" x2="200" y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
        </g>

        {/* Snapped wobbly path */}
        {pathD && (
          <>
            {/* Background Ink Bleed (Feathering) */}
            <path 
              d={pathD} 
              fill="none" 
              stroke="var(--color-ink)" 
              stroke-width="5" 
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.12"
              filter="url(#hand-drawn-wobble)"
            />
            {/* Foreground Core Pen Line */}
            <path 
              d={pathD} 
              fill="none" 
              stroke="var(--color-ink)" 
              stroke-width="2" 
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.9"
              filter="url(#hand-drawn-wobble)"
              class="map-route-path"
            />
          </>
        )}

        {/* Start Point Marker */}
        {startPt && (
          <g filter="url(#hand-drawn-wobble)">
            <circle 
              cx={startPt.x} 
              cy={startPt.y} 
              r="5" 
              fill="var(--color-paper)" 
              stroke="var(--color-ink)" 
              stroke-width="2" 
            />
            <circle 
              cx={startPt.x} 
              cy={startPt.y} 
              r="2" 
              fill="var(--color-ink)" 
            />
          </g>
        )}

        {/* End Point Marker */}
        {endPt && (
          <g filter="url(#hand-drawn-wobble)">
            <polygon 
              points={`${endPt.x},${endPt.y - 6} ${endPt.x - 5},${endPt.y + 4} ${endPt.x + 5},${endPt.y + 4}`}
              fill="var(--color-green)" 
              stroke="var(--color-ink)" 
              stroke-width="2" 
            />
          </g>
        )}
      </svg>
    </div>
  );
}
