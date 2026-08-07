import { db } from '../../db';
import { backfillRideRoutes } from '../../road';
import { scheduleAutoSync } from '../../gdrive';
import { deriveRideTitle, sortLegs } from '../../lib';
import type { LocationUnion, Leg } from '../../types';

interface SaveData {
  rideTitle: string;
  legTitle: string;
  date: string;
  time: string;
  note: string;
  km: number | null;
  distanceMode: 'auto' | 'manual';
  location: LocationUnion | null;
  startLocation: LocationUnion | null;
  photos: Blob[];
  photoThumbs: Blob[];
  coverPhotoIndex: number | null;
}

export async function saveEditorDetails(
  mode: 'new-ride' | 'edit-ride' | 'new-leg' | 'edit' | null,
  rideId: number | null,
  legId: number | null,
  data: SaveData
): Promise<string> {
  // The staged cover photo lives on the first leg; snapshot its thumbnail onto
  // the ride so the home card uses it (immune to later reorder/delete).
  const applyCover = async (rideIdToUpdate: number) => {
    if (data.coverPhotoIndex === null) return;
    const thumb = data.photoThumbs[data.coverPhotoIndex] ?? data.photos[data.coverPhotoIndex];
    if (!thumb) return;
    await db.rides.update(rideIdToUpdate, { coverBlob: thumb });
  };

  if (mode === 'edit-ride') {
    if (!data.rideTitle.trim()) {
      throw new Error('Ride Title is required.');
    }
    const finalTitle = data.rideTitle.trim();
    let startLocPayload: LocationUnion | null = null;
    if (data.startLocation) {
      if (data.startLocation.kind === 'named' && !data.startLocation.name.trim()) {
        startLocPayload = null;
      } else {
        startLocPayload = data.startLocation;
      }
    }

    await db.rides.update(rideId!, {
      title: finalTitle,
      startLocation: startLocPayload,
      distanceMode: data.distanceMode,
    });

    // Ride-date write-through: an edited ride date also updates leg 1, so the
    // (otherwise hidden) coupling stays in one editable place. Skipped when the
    // ride has no legs — there is no first leg to write to.
    if (data.date) {
      const rideLegs = await db.legs.where('rideId').equals(rideId!).toArray();
      const sorted = sortLegs(rideLegs);
      if (sorted.length > 0) {
        await db.legs.update(sorted[0].id!, { date: data.date });
      }
    }

    // Routes re-snap in the background; the ride page fills the map in live as
    // roadPaths land, so save returns immediately instead of blocking on OSRM.
    scheduleAutoSync();
    localStorage.setItem('retread-has-saved', 'true');
    backfillRideRoutes(rideId!).catch((snapErr) => {
      console.warn('Snapping routes failed during ride edit save:', snapErr);
    });
    return `#/ride/${rideId}`;
  }

  if (mode === 'new-ride') {
    // One "log a ride" save creates the ride and its first leg together.
    const finalTitle = data.rideTitle.trim() || deriveRideTitle(data.date);
    let startLocPayload: LocationUnion | null = null;
    if (data.startLocation) {
      if (data.startLocation.kind === 'named' && !data.startLocation.name.trim()) {
        startLocPayload = null;
      } else {
        startLocPayload = data.startLocation;
      }
    }
    const legTitle = data.legTitle.trim() || data.location?.name?.trim() || 'Stop 1';
    const locationPayload = (data.location && (data.location.kind === 'named' ? data.location.name.trim() !== '' : true))
      ? data.location
      : null;
    const legData: Partial<Leg> = {
      date: data.date,
      time: data.time,
      note: data.note.trim(),
      photos: data.photos,
      photoThumbs: data.photoThumbs,
      km: data.km !== null && !isNaN(data.km) ? data.km : null,
      location: locationPayload,
      title: legTitle,
    };

    const newRideId = await db.transaction('rw', db.rides, db.legs, async () => {
      const rideId = await db.rides.add({
        title: finalTitle,
        createdAt: new Date().toISOString(),
        startLocation: startLocPayload,
        distanceMode: 'auto',
      }) as number;
      await db.legs.add({ rideId, ...legData } as Leg);
      return rideId;
    });

    await applyCover(newRideId);
    scheduleAutoSync();
    localStorage.setItem('retread-has-saved', 'true');
    backfillRideRoutes(newRideId).catch((snapErr) => {
      console.warn('Snapping routes failed during new ride save:', snapErr);
    });
    return `#/ride/${newRideId}`;
  }

  // Saving leg entries (mode === 'new-leg' or mode === 'edit')
  const activeRideId = rideId;
  if (activeRideId === null && mode !== 'edit') {
    throw new Error('Ride ID context is missing.');
  }

  const locationPayload = (data.location && (data.location.kind === 'named' ? data.location.name.trim() !== '' : true))
    ? data.location
    : null;

  const legData: Partial<Leg> = {
    date: data.date,
    time: data.time,
    note: data.note.trim(),
    photos: data.photos,
    photoThumbs: data.photoThumbs,
    km: data.km !== null && !isNaN(data.km) ? data.km : null,
    location: locationPayload
  };

  // Title is optional: fall back to the stop label, then to a positional
  // "Stop N" based on the ride's leg order.
  const resolveTitle = async (rideIdToUse: number, existingLeg?: Leg): Promise<string> => {
    if (data.legTitle.trim()) return data.legTitle.trim();
    if (data.location?.name?.trim()) return data.location.name.trim();
    const all = await db.legs.where('rideId').equals(rideIdToUse).toArray();
    const sorted = sortLegs(all);
    let n: number;
    if (existingLeg && existingLeg.id != null) {
      const idx = sorted.findIndex((l) => l.id === existingLeg.id);
      n = (idx >= 0 ? idx : sorted.length) + 1;
    } else {
      n = sorted.length + 1;
    }
    return `Stop ${n}`;
  };

  if (mode === 'edit' && legId !== null) {
    const existingLeg = await db.legs.get(legId);
    if (!existingLeg) throw new Error('Leg to update was not found.');

    legData.title = await resolveTitle(existingLeg.rideId, existingLeg);
    await db.legs.update(legId, legData);
    await applyCover(existingLeg.rideId);
    scheduleAutoSync();
    localStorage.setItem('retread-has-saved', 'true');
    // Background re-snap; the ride page draws the route in live as it lands.
    backfillRideRoutes(existingLeg.rideId).catch((snapErr) => {
      console.warn('Snapping routes failed during edit save:', snapErr);
    });
    return `#/ride/${existingLeg.rideId}`;
  } else {
    legData.title = await resolveTitle(activeRideId!);
    await db.legs.add({
      rideId: activeRideId!,
      ...legData
    } as Leg);
    await applyCover(activeRideId!);
    scheduleAutoSync();
    localStorage.setItem('retread-has-saved', 'true');
    backfillRideRoutes(activeRideId!).catch((snapErr) => {
      console.warn('Snapping routes failed during new save:', snapErr);
    });
    return `#/ride/${activeRideId}`;
  }
}

/**
 * A single leg's payload for the multi-leg backfill save. Each maps to one
 * detected stop from the photo dump: date/time derived from EXIF, an optional
 * GPS pin (median of the stop's cluster), and the photos that clustered into it.
 * A `null` location is stored as a phantom stop (the app already renders those).
 */
export interface BackfillLegInput {
  date: string; // YYYY-MM-DD
  time?: string;
  note?: string;
  photos: Blob[];
  photoThumbs: Blob[];
  km?: number | null;
  location: LocationUnion | null;
  title: string;
}

export interface SaveBackfillTripArgs {
  rideTitle: string;
  startLocation?: LocationUnion | null;
  /** Snapshot thumbnail for the ride card cover (immune to later reorder). */
  coverThumb: Blob | null;
  legs: BackfillLegInput[];
}

/**
 * Backfill save: creates ONE ride + N legs (the day-grouped stops) in a single
 * Dexie transaction. Each leg's title falls back to "Stop N" by its position in
 * the date-sorted legs, matching `resolveTitle`'s convention so a phantom leg
 * still reads as "Stop 2", "Stop 3", … on the ride page.
 *
 * Reuses the exact same post-save invariants as `saveEditorDetails`: snapshot
 * the cover thumbnail onto the ride, schedule a sync, mark `retread-has-saved`,
 * and re-snap routes in the background. Returns the ride route to navigate to.
 */
export async function saveBackfillTrip(args: SaveBackfillTripArgs): Promise<string> {
  const finalTitle = args.rideTitle.trim() || deriveRideTitle(args.legs[0]?.date);
  // Keep the ride timeline in order: legs are written chronologically by date.
  const sortedLegs = [...args.legs].sort((a, b) => a.date.localeCompare(b.date));
  let startLocPayload: LocationUnion | null = null;
  if (args.startLocation) {
    if (args.startLocation.kind === 'named' && !args.startLocation.name.trim()) {
      startLocPayload = null;
    } else {
      startLocPayload = args.startLocation;
    }
  }

  const newRideId = await db.transaction('rw', db.rides, db.legs, async () => {
    const rideId = await db.rides.add({
      title: finalTitle,
      createdAt: new Date().toISOString(),
      startLocation: startLocPayload,
      distanceMode: 'auto',
    }) as number;

    for (let i = 0; i < sortedLegs.length; i++) {
      const leg = sortedLegs[i];
      const locationPayload =
        leg.location && (leg.location.kind === 'named' ? leg.location.name.trim() !== '' : true)
          ? leg.location
          : null;
      const legData: Partial<Leg> = {
        date: leg.date,
        time: leg.time || '',
        note: (leg.note || '').trim(),
        photos: leg.photos,
        photoThumbs: leg.photoThumbs,
        km: leg.km != null && !isNaN(leg.km) ? leg.km : null,
        location: locationPayload,
        // Title fallback consistent with `resolveTitle`: place name, then "Stop N".
        title: leg.title.trim() || (locationPayload?.name?.trim() || `Stop ${i + 1}`),
      };
      await db.legs.add({ rideId, ...legData } as Leg);
    }
    return rideId;
  });

  // Cover snapshot: same invariant as the manual save — snapshot the thumbnail
  // so the home card is immune to later reorder/delete of the leg photos.
  if (args.coverThumb) {
    await db.rides.update(newRideId, { coverBlob: args.coverThumb });
  }
  scheduleAutoSync();
  localStorage.setItem('retread-has-saved', 'true');
  backfillRideRoutes(newRideId).catch((snapErr) => {
    console.warn('Snapping routes failed during backfill save:', snapErr);
  });
  return `#/ride/${newRideId}`;
}
