import { useMemo } from 'preact/hooks';
import { Button } from '../components/button';
import { PhotoLightbox, type LightboxPhoto } from '../components/photo-lightbox';
import { galleryPhotoId, type GalleryPhoto } from './use-gallery-photos';

interface PhotosOverlayProps {
  photoId: string | null;
  photos: GalleryPhoto[];
  onClose: () => void;
  onNavigatePhoto: (photoId: string) => void;
  onViewRide: (route: string) => void;
}

// The Photos page's lightbox, rendered on top of the wall while
// "#/photos?photo=N" is set. A thin adapter over the shared PhotoLightbox: it
// maps gallery photos into LightboxPhoto entries (identity = leg:id + index)
// and supplies the "View ride" footer action. Behavior is unchanged from the
// previous inline implementation — the photo is the hero on a paper ground with
// a caption and two actions, and "View ride" -> Back restores the exact photo.
export function PhotosOverlay({
  photoId,
  photos,
  onClose,
  onNavigatePhoto,
  onViewRide,
}: PhotosOverlayProps) {
  const lightboxPhotos: LightboxPhoto[] = useMemo(
    () =>
      photos.map((p) => ({
        id: galleryPhotoId(p),
        blob: p.leg.photos?.[p.photoIndex] ?? new Blob(),
        alt: p.ride.title || 'Ride photograph',
      })),
    [photos]
  );

  return (
    <PhotoLightbox
      open={photoId !== null}
      photos={lightboxPhotos}
      activeId={photoId}
      onNavigate={onNavigatePhoto}
      onClose={onClose}
      footer={({ photo }) => {
        const gp = photos.find((q) => galleryPhotoId(q) === photo.id);
        return gp ? (
          <Button variant="secondary" size="sm" onClick={() => onViewRide(`#/ride/${gp.ride.id}`)}>
            View ride
          </Button>
        ) : null;
      }}
    />
  );
}
