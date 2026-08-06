import { useEffect, useState } from 'preact/hooks';
import type { HomeRideEntry } from './use-ride-book';
import type { Leg, Ride } from '../types';

export interface GalleryPhoto {
  ride: Ride;
  leg: Leg;
  photoIndex: number;
}

// Stable identity for a photo so the shell overlay can restore the exact one
// across navigation and reshuffles (indexes are order-dependent and move).
export function galleryPhotoId(p: GalleryPhoto): string {
  return `${p.leg.id}:${p.photoIndex}`;
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

  for (let i = rideOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rideOrder[i], rideOrder[j]] = [rideOrder[j], rideOrder[i]];
  }

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

// App-level shared list: every photo in the book in one stable shuffled order.
// Lives above the router so the gallery wall and the shell-level overlay read
// the same arrangement, and "View ride" -> Back restores the exact photo.
// Object URLs are NOT created here — the wall and overlay materialize their
// own, so the whole book never holds more URLs than what's on screen.
export function useGalleryPhotos(ridesData: HomeRideEntry[] | undefined): GalleryPhoto[] {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);

  useEffect(() => {
    if (!ridesData) return;
    const collected: GalleryPhoto[] = [];
    for (const entry of ridesData) {
      for (const leg of entry.legs) {
        const arr = leg.photos || [];
        for (let i = 0; i < arr.length; i++) {
          collected.push({ ride: entry.ride, leg, photoIndex: i });
        }
      }
    }
    setPhotos(interleaveShuffle(collected));
  }, [ridesData]);

  return photos;
}
