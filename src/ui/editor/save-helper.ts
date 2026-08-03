import { db } from '../../db';
import { backfillTripRoutes } from '../../road';
import { scheduleAutoSync } from '../../gdrive';
import type { LocationUnion, Page } from '../../types';

interface SaveData {
  tripTitle: string;
  dayTitle: string;
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
  mode: 'new-trip' | 'edit-trip' | 'new-day' | 'edit' | null,
  tripId: number | null,
  pageId: number | null,
  data: SaveData
): Promise<string> {
  if (mode === 'edit-trip') {
    if (!data.tripTitle.trim()) {
      throw new Error('Ride Title is required.');
    }
    const finalTitle = data.tripTitle.trim();
    let startLocPayload: LocationUnion | null = null;
    if (data.startLocation) {
      if (data.startLocation.kind === 'named' && !data.startLocation.name.trim()) {
        startLocPayload = null;
      } else {
        startLocPayload = data.startLocation;
      }
    }

    await db.trips.update(tripId!, {
      title: finalTitle,
      startLocation: startLocPayload,
      distanceMode: data.distanceMode,
      startOdo: data.distanceMode === 'odo' ? (data.startOdo !== null && !isNaN(data.startOdo) ? data.startOdo : 0) : null
    });

    try {
      await backfillTripRoutes(tripId!);
    } catch (snapErr) {
      console.warn('Snapping routes failed during trip edit save:', snapErr);
    }

    scheduleAutoSync();
    return `#/trip/${tripId}`;
  }

  if (mode === 'new-trip') {
    if (!data.tripTitle.trim()) {
      throw new Error('Ride Title is required to start a new ride.');
    }
    const finalTitle = data.tripTitle.trim();
    let startLocPayload: LocationUnion | null = null;
    if (data.startLocation) {
      if (data.startLocation.kind === 'named' && !data.startLocation.name.trim()) {
        startLocPayload = null;
      } else {
        startLocPayload = data.startLocation;
      }
    }

    const newTripId = await db.trips.add({
      title: finalTitle,
      createdAt: new Date().toISOString(),
      startLocation: startLocPayload,
      distanceMode: data.distanceMode,
      startOdo: data.distanceMode === 'odo' ? (data.startOdo !== null && !isNaN(data.startOdo) ? data.startOdo : 0) : null
    }) as number;

    scheduleAutoSync();
    return `#/trip/${newTripId}`;
  }

  // Saving daily legs (mode === 'new-day' or mode === 'edit')
  const activeTripId = tripId;
  if (activeTripId === null && mode !== 'edit') {
    throw new Error('Trip ID context is missing.');
  }

  const locationPayload = (data.location && (data.location.kind === 'named' ? data.location.name.trim() !== '' : true))
    ? data.location
    : null;

  const pageData: Partial<Page> = {
    date: data.date,
    time: data.time,
    note: data.note.trim(),
    photos: data.photos,
    km: data.km !== null && !isNaN(data.km) ? data.km : null,
    odo: data.odo !== null && !isNaN(data.odo) ? data.odo : null,
    location: locationPayload,
    title: data.dayTitle.trim()
  };

  if (mode === 'edit' && pageId !== null) {
    const existingPage = await db.pages.get(pageId);
    if (!existingPage) throw new Error('Page to update was not found.');
    
    await db.pages.update(pageId, pageData);
    try {
      await backfillTripRoutes(existingPage.tripId);
    } catch (snapErr) {
      console.warn('Snapping routes failed during edit save:', snapErr);
      throw new Error(`Snapping failed: ${(snapErr as Error).message || snapErr}. Used straight-line fallback.`);
    }
    scheduleAutoSync();
    return `#/trip/${existingPage.tripId}`;
  } else {
    await db.pages.add({
      tripId: activeTripId!,
      ...pageData
    } as Page);
    try {
      await backfillTripRoutes(activeTripId!);
    } catch (snapErr) {
      console.warn('Snapping routes failed during new save:', snapErr);
      throw new Error(`Snapping failed: ${(snapErr as Error).message || snapErr}. Used straight-line fallback.`);
    }
    scheduleAutoSync();
    return `#/trip/${activeTripId}`;
  }
}
