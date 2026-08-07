import { useEffect, useMemo } from 'preact/hooks';
import { PageHeader } from '../components/page-header';
import { Button } from '../components/button';
import { galleryPhotoId, type GalleryPhoto } from './use-gallery-photos';
import { PhotosOverlay } from './photos-overlay';
import type { HomeRideEntry } from './use-ride-book';

interface PhotosProps {
  ridesData: HomeRideEntry[] | undefined;
  photos: GalleryPhoto[];
  photoId: string | null;
  onOpenPhoto: (photoId: string) => void;
  onClose: () => void;
  onNavigatePhoto: (photoId: string) => void;
  onNavigate: (route: string) => void;
  onNavigateBack: (logicalParent: string | null) => void;
}

// The global photo wall: every picture in the book in a stable shuffled order
// (computed once at the App shell by useGalleryPhotos), each tap opening the
// lightbox via "#/photos?photo=N". Thumb object URLs are created here,
// locally, so a big book never holds more URLs than what's on this screen.
export function Photos({ ridesData, photos, photoId, onOpenPhoto, onClose, onNavigatePhoto, onNavigate, onNavigateBack }: PhotosProps) {
  // Built synchronously so the first render already has every tile — no
  // empty-first-render flash. URLs are created here, locally, and revoked by
  // the cleanup effect below: on `photos` change the previous memo's URLs are
  // revoked before the next render commits, and on unmount all of them are
  // released. A URL is never used after it is revoked (no ERR_FILE_NOT_FOUND).
  const wall = useMemo<{ p: GalleryPhoto; url: string }[]>(
    () =>
      photos.map((p) => ({
        p,
        url: URL.createObjectURL(p.leg.photoThumbs?.[p.photoIndex] || p.leg.photos![p.photoIndex]),
      })),
    [photos],
  );

  useEffect(() => {
    return () => wall.forEach((t) => URL.revokeObjectURL(t.url));
  }, [wall]);

  return (
    <div class="photos-container">
      <PageHeader onBack={() => onNavigateBack('#/')} />

      <main class="photos-body">
        <h2 class="page-heading">Photographs</h2>
        <p class="photos-sub">Every picture in the book, shuffled like a shoebox.</p>

        {ridesData === undefined ? (
          <div class="photos-skeleton" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div class="photos-skeleton-tile" key={i} />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div class="photos-empty">
            <p>No photographs yet — every photo you add to a leg lands here.</p>
            <Button variant="primary" size="sm" onClick={() => onNavigate('#/')}>
              Back to your ride book
            </Button>
          </div>
        ) : (
          <div class="photos-masonry">
            {wall.map(({ p, url }) => (
              <button
                key={`${p.leg.id}:${p.photoIndex}`}
                type="button"
                class="photo-tile"
                aria-label={`${p.ride.title || 'Ride'} photo ${p.photoIndex + 1}`}
                onClick={() => onOpenPhoto(galleryPhotoId(p))}
              >
                <img src={url} alt={p.ride.title || 'Ride photograph'} />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Route-driven lightbox: mounted with the page so it can play its exit
          fade when ?photo= is removed; visible only while photoId is set. */}
      <PhotosOverlay
        photoId={photoId}
        photos={photos}
        onClose={onClose}
        onNavigatePhoto={onNavigatePhoto}
        onViewRide={onNavigate}
      />
    </div>
  );
}
