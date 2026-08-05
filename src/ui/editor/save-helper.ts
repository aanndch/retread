import { db } from '../../db';
import { backfillRideRoutes } from '../../road';
import { scheduleAutoSync } from '../../gdrive';
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
    if (!data.rideTitle.trim()) {
      throw new Error('Ride Title is required to start a new ride.');
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

    const newRideId = await db.rides.add({
      title: finalTitle,
      createdAt: new Date().toISOString(),
      startLocation: startLocPayload,
      distanceMode: data.distanceMode,
    }) as number;

    scheduleAutoSync();
    backfillRideRoutes(newRideId).catch((snapErr) => {
      console.warn('Snapping routes failed during new ride save:', snapErr);
    });
    // Continue straight into logging the first leg so the user isn't stranded
    // on an empty ride page; they can always back out of the leg form.
    return `#/edit?mode=new-leg&rideId=${newRideId}`;
  }

  // Saving leg entries (mode === 'new-leg' or mode === 'edit')
  if (!data.legTitle.trim()) {
    throw new Error('Leg Title is required to save.');
  }

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
    location: locationPayload,
    title: data.legTitle.trim()
  };

  // The staged cover photo lives on this leg; snapshot its thumbnail onto the
  // ride so the home card uses it (immune to later reorder/delete of this leg).
  const applyCover = async (rideIdToUpdate: number) => {
    if (data.coverPhotoIndex === null) return;
    const thumb = data.photoThumbs[data.coverPhotoIndex] ?? data.photos[data.coverPhotoIndex];
    if (!thumb) return;
    await db.rides.update(rideIdToUpdate, { coverBlob: thumb });
  };

  if (mode === 'edit' && legId !== null) {
    const existingLeg = await db.legs.get(legId);
    if (!existingLeg) throw new Error('Leg to update was not found.');
    
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
