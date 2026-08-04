import { useMemo } from 'preact/hooks';

export interface SquiggleSegment {
  path: { lat: number; lng: number }[];
  fallback?: boolean;
  color?: string;
}

export interface SquiggleStop {
  lat: number;
  lng: number;
  label?: string;
  kind?: 'start' | 'stop' | 'end';
}

interface SquiggleMapProps {
  path?: { lat: number; lng: number }[];
  segments?: SquiggleSegment[];
  stops?: SquiggleStop[];
  width?: number;
  height?: number;
  hideWrapper?: boolean;
  hideGrid?: boolean;
  skipFilter?: boolean;
  compass?: boolean;
  caption?: string;
  // Hides intermediate stop labels until the map is hovered. Used on crowded
  // ride heroes so the route stays readable; labels always show in the overlay.
  revealIntermediateLabels?: boolean;
}

// Day palette shared by the squiggle map and the ride timeline so a ride's
// route colors always match its day-group labels. Ordered as a near-monotonic
// lightness ramp: day 1 is the strongest ink, then warms upward through earth
// tones and lands on sage — echoing the green finish pin without colliding
// with it. Saturated green is deliberately NOT in the cycle: it is reserved
// for the end-destination marker.
export const DAY_COLORS = [
  'var(--color-ink)',            // 1 — near-black (departure)
  'var(--color-tint-2)',         // 2 — dark umber
  'var(--color-ink-muted)',      // 3 — warm gray
  'var(--color-tint-1)',         // 4 — tan
  'var(--color-tint-3)',         // 5 — light khaki
  'var(--color-green-light)',    // 6 — sage (arrival)
];

function truncateLabel(label: string, max = 14): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

// Horizontal label placement for side-anchored markers (start ring / end dot).
// Picks the side with more open space so text never runs past the map edge.
export function sideAnchor(ptX: number, width: number): { x: number; anchor: 'start' | 'end' } {
  const margin = 7;
  const roomLeft = ptX - margin - 3;
  const roomRight = width - 3 - (ptX + margin);
  if (roomLeft >= roomRight) return { x: ptX - margin, anchor: 'end' };
  return { x: ptX + margin, anchor: 'start' };
}

// Label placement for centered intermediate stops: keep the label on the
// inner half of the map vertically, and nudge it sideways when hugging an edge.
export function centerLabel(pt: { x: number; y: number }, width: number, height: number) {
  const above = pt.y >= height / 2;
  let x = pt.x;
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  if (pt.x < width * 0.28) { x = pt.x + 6; anchor = 'start'; }
  else if (pt.x > width * 0.72) { x = pt.x - 6; anchor = 'end'; }
  return { x, y: pt.y + (above ? -7 : 13), anchor };
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
  segments,
  stops,
  width = 300, 
  height = 150, 
  hideWrapper = false, 
  hideGrid = false,
  skipFilter = false,
  compass = false,
  caption,
  revealIntermediateLabels = false
}: SquiggleMapProps) {
  const segmentsNorm = useMemo(() => {
    if (segments && segments.length > 0) return segments;
    if (path && path.length > 0) return [{ path }];
    return [];
  }, [segments, path]);

  const stopsNorm = stops || [];

  // Every point that drives the projection: all segment shapes plus all stops,
  // so markers and labels always share the route's transform.
  const allPts = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [];
    for (const s of segmentsNorm) pts.push(...s.path);
    for (const st of stopsNorm) pts.push({ lat: st.lat, lng: st.lng });
    return pts;
  }, [segmentsNorm, stopsNorm]);

  // A map can be route-less but still meaningful when stops exist (a single
  // GPS pin without a snapped path), so a lone stop must render, not empty.
  const hasContent = allPts.length >= 2 || stopsNorm.length > 0;

  // Simplify each segment on its own so multi-day routes keep per-leg detail.
  const simplified = useMemo(
    () => segmentsNorm.map((s) => ({ ...s, pts: s.path.length < 2 ? [] : simplifyPath(s.path, 200) })),
    [segmentsNorm]
  );

  const { project, pathDs, routeStartPt, routeEndPt } = useMemo(() => {
    if (!hasContent) return { project: null, pathDs: [], routeStartPt: null, routeEndPt: null };

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const p of allPts) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const padding = 14;
    const latSpan = Math.max(maxLat - minLat, 0.0001);
    const lngSpan = Math.max(maxLng - minLng, 0.0001);

    const scaleX = (width - 2 * padding) / lngSpan;
    const scaleY = (height - 2 * padding) / latSpan;
    const scale = Math.min(scaleX, scaleY);

    const xOffset = (width - lngSpan * scale) / 2;
    const yOffset = (height - latSpan * scale) / 2;

    const project = (p: { lat: number; lng: number }) => ({
      x: xOffset + (p.lng - minLng) * scale,
      y: yOffset + (maxLat - p.lat) * scale,
    });

    const pathDs = simplified.map((s) => {
      const pts = s.pts.map(project);
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const cpX1 = p0.x + (p1.x - p0.x) / 3;
        const cpY1 = p0.y + (p1.y - p0.y) / 3;
        const cpX2 = p0.x + (2 * (p1.x - p0.x)) / 3;
        const cpY2 = p0.y + (2 * (p1.y - p0.y)) / 3;
        d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
      }
      return d;
    });

    const firstSegPts = simplified[0]?.pts || [];
    const lastSegPts = simplified[simplified.length - 1]?.pts || [];

    return {
      project,
      pathDs,
      routeStartPt: firstSegPts.length ? project(firstSegPts[0]) : null,
      routeEndPt: lastSegPts.length ? project(lastSegPts[lastSegPts.length - 1]) : null,
    };
  }, [hasContent, allPts, simplified, width, height]);

  // Explicit start/end stops override the route-derived markers; everything
  // else renders as an intermediate stop.
  const explicitStart = stopsNorm.find((s) => s.kind === 'start');
  const explicitEnd = stopsNorm.find((s) => s.kind === 'end');
  const startPt = explicitStart && project ? project({ lat: explicitStart.lat, lng: explicitStart.lng }) : routeStartPt;
  const endPt = explicitEnd && project ? project({ lat: explicitEnd.lat, lng: explicitEnd.lng }) : routeEndPt;
  const startLabel = explicitStart?.label;
  const endLabel = explicitEnd?.label;
  const interStops = stopsNorm.filter((s) => s.kind !== 'start' && s.kind !== 'end');

  if (!hasContent) {
    return (
      <div class="squiggle-map-empty">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 17 L7 9 L11 14 L17 5 L21 10" stroke-dasharray="2 3" />
          <circle cx="3" cy="17" r="1.6" fill="currentColor" />
          <circle cx="21" cy="10" r="1.6" fill="currentColor" />
        </svg>
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
        <g class="sqg-grid">
          <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1={width * 0.25} y1="0" x2={width * 0.25} y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1={width * 0.5} y1="0" x2={width * 0.5} y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
          <line x1={width * 0.75} y1="0" x2={width * 0.75} y2={height} stroke="var(--color-paper-dim)" stroke-dasharray="2,4" />
        </g>
      )}

      {pathDs.map((d, i) => {
        const s = simplified[i];
        const stroke = s.color || 'var(--color-ink)';
        const dashed = s.fallback;
        return (
          <g key={i}>
            <path
              d={d}
              fill="none"
              stroke={stroke}
              stroke-width="5"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.12"
              filter={filterAttr}
              stroke-dasharray={dashed ? '3 4' : undefined}
            />
            <path
              d={d}
              fill="none"
              stroke={stroke}
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="0.9"
              filter={filterAttr}
              class={dashed ? 'sqg-fallback' : skipFilter ? undefined : 'map-route-path'}
            />
          </g>
        );
      })}

      {startPt && (
        <g>
          <circle
            cx={startPt.x}
            cy={startPt.y}
            r="5"
            fill="var(--color-paper)"
            stroke="var(--color-ink)"
            stroke-width="2"
          />
          {startLabel && (() => {
            const { x, anchor } = sideAnchor(startPt.x, width);
            return (
              <text x={x} y={startPt.y + 3} text-anchor={anchor} class="sqg-stop-label">
                {truncateLabel(startLabel)}
              </text>
            );
          })()}
        </g>
      )}

      {interStops.map((st, i) => {
        if (!project) return null;
        const pt = project({ lat: st.lat, lng: st.lng });
        const { x, y, anchor } = centerLabel(pt, width, height);
        return (
          <g key={`stop-${i}`}>
            <circle
              cx={pt.x}
              cy={pt.y}
              r="4"
              fill="var(--color-paper)"
              stroke="var(--color-ink)"
              stroke-width="2"
            />
            {st.label && (
              <text
                x={x}
                y={y}
                text-anchor={anchor}
                class={revealIntermediateLabels ? 'sqg-stop-label sqg-label-hidden' : 'sqg-stop-label'}
              >
                {truncateLabel(st.label)}
              </text>
            )}
          </g>
        );
      })}

      {endPt && (() => {
        const cx = endPt.x;
        const cy = endPt.y;
        return (
          <g>
            <circle cx={cx} cy={cy} r="4" fill="var(--color-green)" />
            {endLabel && (() => {
              const { x, anchor } = sideAnchor(cx, width);
              return (
                <text x={x} y={cy + 3} text-anchor={anchor} class="sqg-stop-label">
                  {truncateLabel(endLabel)}
                </text>
              );
            })()}
          </g>
        );
      })()}

      {compass && (
        <g class="sqg-compass" transform={`translate(${width - 24}, 18)`} filter={filterAttr}>
          <path
            d="M0 4 L0 -6 L-2.5 -3.5 M0 -6 L2.5 -3.5"
            fill="none"
            stroke="var(--color-ink-muted)"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <text x="0" y="12" text-anchor="middle" class="sqg-compass-label">N</text>
        </g>
      )}

      {caption && (
        <text
          x={width - 6}
          y={height - 6}
          text-anchor="end"
          dominant-baseline="bottom"
          class="sqg-caption"
        >
          {caption}
        </text>
      )}
    </svg>
  );

  if (hideWrapper) return svgContent;

  return (
    <div class="squiggle-map-wrapper">
      {svgContent}
    </div>
  );
}
