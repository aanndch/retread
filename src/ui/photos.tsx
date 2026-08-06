import { useEffect, useState } from 'preact/hooks';
import { PageHeader } from '../components/page-header';
import { Button } from '../components/button';
import { useHistoryModal } from '../components/use-history-modal';
import { PhotosOverlay } from './photos-overlay';
import type { HomeRideEntry } from './use-ride-book';
import type { Leg, Ride } from '../types';

export interface GalleryPhoto {
  ride: Ride;
  leg: Leg;
  photoIndex: number;
  thumbUrl: string;
}

interface PhotosProps {
  ridesData: HomeRideEntry[] | undefined;
  onNavigate: (route: string) => void;
  onNavigateBack: (logicalParent: string | null) => void;
}

// Shuffle the rides, then round-robin one photo from each so the wall mixes
// trips instead of clustering a single ride together — a stable-per-visit
// "shoebox" arrangement. The same order powers the overlay's swipe + counter.
function interleaveShuffle(photos: GalleryPhoto[]): GalleryPhoto[] {
  if (photos.length === 0) return [];

  const byRide = new Map<number, GalleryPhoto[]>();
  const rideOrder: number[] = [];
  for (const p of photos) {
    const id = p.ride.id!;
    let arr = byRide.get(id);
    if (!arr) {
      arr = [];
      byRide.set(id, arr);
      rideOrder.push(id);
    }
    arr.push(p);
  }

  // Fisher-Yates the ride order so no visit is ever the same.
  for (let i = rideOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rideOrder[i], rideOrder[j]] = [rideOrder[j], rideOrder[i]];
  }

  // Round-robin: take one photo from each ride per pass until all are placed.
  const result: GalleryPhoto[] = [];
  const cursor = new Map<number, number>(rideOrder.map((id) => [id, 0]));
  let done = false;
  while (!done) {
    done = true;
    for (const id of rideOrder) {
      const arr = byRide.get(id)!;
      const at = cursor.get(id)!;
      if (at < arr.length) {
        result.push(arr[at]);
        cursor.set(id, at + 1);
        done = false;
      }
    }
  }
  return result;
}

// The global photo wall: every picture in the book, shuffled like a shoebox,
// with a paper-styled overlay that carries just enough context (which ride,
// where in the stream) without distracting from the photo itself.
export function Photos({ ridesData, onNavigate, onNavigateBack }: PhotosProps) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [overlayOpen, openOverlay, closeOverlay] = useHistoryModal('gallery-photo');

  // Flatten every photo in the book and shuffle once per data snapshot. Object
  // URLs are for the small 320px thumbs; full photos are created on demand
  // inside the overlay so a big book doesn't hold hundreds of full-size URLs.
  useEffect(() => {
    if (!ridesData) return;
    const collected: GalleryPhoto[] = [];
    for (const entry of ridesData) {
      for (const leg of entry.legs) {
        const arr = leg.photos || [];
        for (let i = 0; i < arr.length; i++) {
          const thumb = leg.photoThumbs?.[i] || arr[i];
          collected.push({
            ride: entry.ride,
            leg,
            photoIndex: i,
            thumbUrl: URL.createObjectURL(thumb),
          });
        }
      }
    }
    setPhotos(interleaveShuffle(collected));
    return () => collected.forEach((p) => URL.revokeObjectURL(p.thumbUrl));
  }, [ridesData]);

  const openPhoto = (i: number) => {
    setActiveIdx(i);
    openOverlay();
  };

  return (
    <div class="photos-container">
      <PageHeader onBack={() => onNavigateBack('#/')} />

      <main class="photos-body">
        <h2 class="page-heading">Photographs</h2>
        <p class="photos-sub">Every picture in the book, shuffled like a shoebox.</p>

        {ridesData === undefined ? (
          <p class="loading-text">Loading photographs...</p>
        ) : photos.length === 0 ? (
          <div class="photos-empty">
            <p>No photographs yet — every photo you add to a leg lands here.</p>
            <Button variant="primary" size="sm" onClick={() => onNavigate('#/')}>
              Back to your ride book
            </Button>
          </div>
        ) : (
          <div class="photos-masonry">
            {photos.map((p, i) => (
              <button
                key={`${p.leg.id}:${p.photoIndex}`}
                type="button"
                class="photo-tile"
                aria-label={`${p.ride.title || 'Ride'} photo ${p.photoIndex + 1}`}
                onClick={() => openPhoto(i)}
              >
                <img src={p.thumbUrl} alt={p.ride.title || 'Ride photograph'} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </main>

      <PhotosOverlay
        isOpen={overlayOpen}
        photos={photos}
        activeIdx={activeIdx}
        setActiveIdx={setActiveIdx}
        onClose={closeOverlay}
        onViewRide={(rideId) => onNavigate(`#/ride/${rideId}`)}
      />
    </div>
  );
}
