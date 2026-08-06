import type { ComponentChildren } from 'preact';
import { SquiggleMap } from '../ui/squiggle';
import type { SquiggleSegment, SquiggleStop } from '../ui/squiggle';

interface MapHeroProps {
  segments?: SquiggleSegment[];
  stops?: SquiggleStop[];
  caption?: string;
  revealIntermediateLabels?: boolean;
  // Route is still being drawn (OSRM backfill running); show the spinner.
  pending?: boolean;
  onOpen: () => void;
  // Rendered when there's no route content (empty-state with CTA).
  empty: ComponentChildren;
}

// Interactive route map hero shared by the ride and leg pages: the tappable
// SquiggleMap that opens the fullscreen MapModal, the "Drawing route…" overlay
// while OSRM snaps pins, and the empty-state fallback when nothing is drawn.
export function MapHero({
  segments,
  stops,
  caption,
  revealIntermediateLabels,
  pending,
  onOpen,
  empty,
}: MapHeroProps) {
  const hasContent =
    (segments !== undefined && segments.length > 0) || (stops !== undefined && stops.length > 0);

  return (
    <section class="ride-map-hero">
      {hasContent ? (
        <div class="map-interactive-trigger" onClick={onOpen} style={{ position: 'relative' }}>
          <SquiggleMap
            segments={segments}
            stops={stops}
            width={430}
            height={300}
            compass
            caption={caption}
            revealIntermediateLabels={revealIntermediateLabels}
          />
          {pending && (
            <div class="map-loading-overlay" aria-live="polite">
              <span class="map-loading-spinner" aria-hidden="true" />
              <span>Drawing route…</span>
            </div>
          )}
        </div>
      ) : (
        empty
      )}
    </section>
  );
}
