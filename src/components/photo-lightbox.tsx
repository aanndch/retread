import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { CloseIcon } from './icons';
import { useBodyScrollLock } from './use-body-scroll-lock';
import { useExitFade } from './use-exit-fade';
import { useOverlayFocus } from './use-overlay-focus';

// A single photo the lightbox can show. `id` is a stable identity used to
// resolve the active photo (so the lightbox survives reshuffles / URL edits);
// `blob` is the full-size source materialized into an object URL while active.
export interface LightboxPhoto {
  id: string;
  blob: Blob;
  alt: string;
}

export interface PhotoLightboxFooterContext {
  photo: LightboxPhoto;
  index: number;
  total: number;
}

interface PhotoLightboxProps {
  open: boolean;
  photos: LightboxPhoto[];
  activeId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
  // Optional right-hand footer action slot. Renders nothing when absent, so a
  // bare lightbox (e.g. the Photos gallery) shows only the photo counter.
  footer?: (ctx: PhotoLightboxFooterContext) => ComponentChildren;
  // Optional marginalia above the mounted print (ride · leg · date context),
  // set in the mechanical 10px uppercase kicker voice. Rendered when provided.
  meta?: string;
  ariaLabel?: string;
}

// Shared paper-styled lightbox used by the Photos gallery and the leg page's
// photo modal. The photo is the hero on a paper ground, framed like a mounted
// print, with a caption and an optional action. The active photo is resolved by
// `activeId` identity, so navigation + Back restore the exact photo. The
// `?photo=` param is the single source of truth for "open": removing it plays a
// short fade-out so the lightbox never cuts to a blank frame, and the page
// scroll stays locked until the fade completes. The closing fade is
// --motion-fast (150ms), so the unmount timer matches that.
export function PhotoLightbox({
  open,
  photos,
  activeId,
  onNavigate,
  onClose,
  footer,
  meta,
  ariaLabel = 'Photo viewer',
}: PhotoLightboxProps) {
  const touchStartX = useRef(0);
  const backdropRef = useRef<HTMLDivElement>(null);
  const { visible, closing } = useExitFade(open, 150);
  useBodyScrollLock(visible);
  useOverlayFocus(visible, backdropRef);

  // Keep the last non-null active photo on screen through the exit fade —
  // activeId goes null the moment the param is popped, but the fade must show
  // the photo that was open, not snap to the first in the list.
  const lastActiveIdRef = useRef<string | null>(activeId);
  if (activeId !== null) lastActiveIdRef.current = activeId;
  const resolvedActiveId = activeId ?? lastActiveIdRef.current;

  const activeIdx = Math.max(0, photos.findIndex((p) => p.id === resolvedActiveId));
  const active = photos[activeIdx];

  // Full-size object URL for the active photo only, so a big book never holds
  // hundreds of full-size URLs in memory at once. Keyed on `visible` so the
  // photo stays in the frame during the exit fade.
  const [fullUrl, setFullUrl] = useState('');
  useEffect(() => {
    if (!visible || photos.length === 0) {
      // Closed (or empty): drop the object URL so a reopen never briefly
      // renders the previous photo's revoked URL (that fetch logs
      // ERR_FILE_NOT_FOUND). The photo itself stays up through the exit fade
      // because `visible` stays true for the fade duration.
      setFullUrl('');
      return;
    }
    const blob = active?.blob;
    if (!blob) {
      setFullUrl('');
      return;
    }
    const url = URL.createObjectURL(blob);
    setFullUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [visible, activeIdx, photos, active]);

  // Dialog semantics: Escape closes. Focus handling (move into the backdrop on
  // open, trap Tab, restore on close) lives in useOverlayFocus.
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible || photos.length === 0) return null;

  const step = (dir: 1 | -1) => {
    const next = (activeIdx + dir + photos.length) % photos.length;
    onNavigate(photos[next].id);
  };

  const footerAction = footer ? footer({ photo: active, index: activeIdx, total: photos.length }) : null;

  return (
    <div ref={backdropRef} class={`photo-paper-backdrop${closing ? ' closing' : ''}`} role="dialog" aria-modal="true" aria-label={ariaLabel} onClick={onClose}>
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
        {meta && <span class="photo-paper-meta">{meta}</span>}
        <div class="photo-paper-frame">
          {fullUrl && (
            <img src={fullUrl} alt={active?.alt || 'Ride photograph'} class="photo-paper-img" />
          )}
        </div>
      </div>

      <div class="photo-paper-footer" onClick={(e) => e.stopPropagation()}>
        <div class="photo-paper-pager">
          <button
            type="button"
            class="photo-pager-btn"
            aria-label="Previous photo"
            onClick={() => step(-1)}
          >
            ◀
          </button>
          <span class="photo-paper-counter">
            {String(activeIdx + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            class="photo-pager-btn"
            aria-label="Next photo"
            onClick={() => step(1)}
          >
            ▶
          </button>
        </div>
        {footerAction && <span class="photo-paper-action">{footerAction}</span>}
      </div>
    </div>
  );
}
