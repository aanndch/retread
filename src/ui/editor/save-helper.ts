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
  odo: number | null;
  distanceMode: 'auto' | 'manual' | 'odo';
  startOdo: number | null;
  location: LocationUnion | null;
  startLocation: LocationUnion | null;
  photos: Blob[];
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
      startOdo: data.distanceMode === 'odo' ? (data.startOdo !== null && !isNaN(data.startOdo) ? data.startOdo : 0) : null
    });

    try {
      await backfillRideRoutes(rideId!);
    } catch (snapErr) {
      console.warn('Snapping routes failed during ride edit save:', snapErr);
    }

    scheduleAutoSync();
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
      startOdo: data.distanceMode === 'odo' ? (data.startOdo !== null && !isNaN(data.startOdo) ? data.startOdo : 0) : null
    }) as number;

    scheduleAutoSync();
    return `#/ride/${newRideId}`;
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
    km: data.km !== null && !isNaN(data.km) ? data.km : null,
    odo: data.odo !== null && !isNaN(data.odo) ? data.odo : null,
    location: locationPayload,
    title: data.legTitle.trim()
  };

  if (mode === 'edit' && legId !== null) {
    const existingLeg = await db.legs.get(legId);
    if (!existingLeg) throw new Error('Leg to update was not found.');
    
    await db.legs.update(legId, legData);
    try {
      await backfillRideRoutes(existingLeg.rideId);
    } catch (snapErr) {
      console.warn('Snapping routes failed during edit save:', snapErr);
      throw new Error(`Snapping failed: ${(snapErr as Error).message || snapErr}. Used straight-line fallback.`);
    }
    scheduleAutoSync();
    return `#/ride/${existingLeg.rideId}`;
  } else {
    await db.legs.add({
      rideId: activeRideId!,
      ...legData
    } as Leg);
    try {
      await backfillRideRoutes(activeRideId!);
    } catch (snapErr) {
      console.warn('Snapping routes failed during new save:', snapErr);
      throw new Error(`Snapping failed: ${(snapErr as Error).message || snapErr}. Used straight-line fallback.`);
    }
    scheduleAutoSync();
    return `#/ride/${activeRideId}`;
  }
}
