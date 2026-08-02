import { db } from './db';


// Compute Haversine distance in kilometers between two GPS points
export function haversineDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }): number {
  const R = 6371; // Earth radius in km
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Query OSRM Routing API for a single leg between from and to coords
export async function snapLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ lat: number; lng: number }[]> {
  const directDist = haversineDistance(from, to);
  
  // Safeguard: If points are basically identical, return direct line
  if (directDist < 0.1) {
    return [from, to];
  }

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM API error: ${res.statusText}`);
    }
    
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const osrmKm = route.distance / 1000;
      
      // Safeguard: If OSRM distance is > 5x direct distance, drop snap to prevent erratic loops
      if (osrmKm > 5 * directDist) {
        console.warn(`OSRM detour safety triggered: OSRM is ${osrmKm.toFixed(1)}km vs direct ${directDist.toFixed(1)}km. Dropping snap.`);
        return [from, to];
      }
      
      // Convert OSRM GeoJSON coords [lng, lat] to list of {lat, lng}
      if (route.geometry && route.geometry.coordinates) {
        return route.geometry.coordinates.map((coord: [number, number]) => ({
          lat: coord[1],
          lng: coord[0]
        }));
      }
    }
    
    return [from, to];
  } catch (err) {
    console.warn(`OSRM snapping failed: ${err}. Falling back to direct line.`);
    return [from, to];
  }
}

// Retroactive Snapper: Backfills missing road paths for all pages of a trip
export async function backfillTripRoutes(tripId: number): Promise<void> {
  // Query all pages for the trip sorted chronologically
  const pages = await db.pages.where('tripId').equals(tripId).toArray();
  const sortedPages = [...pages].sort((a, b) => a.date.localeCompare(b.date) || (a.id || 0) - (b.id || 0));

  // Load the trip record to get the departure pin
  const tripRecord = await db.trips.get(tripId);

  let legUpdated = false;

  for (let i = 0; i < sortedPages.length; i++) {
    const currentPage = sortedPages[i];
    
    // First page: use Trip.startLocation as the departure point
    if (i === 0) {
      if (tripRecord?.startLocation?.kind === 'gps' && currentPage.location?.kind === 'gps') {
        const fromGps = { lat: tripRecord.startLocation.lat, lng: tripRecord.startLocation.lng };
        const toGps = { lat: currentPage.location.lat, lng: currentPage.location.lng };

        const needsSnap =
          !currentPage.roadPath ||
          currentPage.roadPath.length < 2 ||
          haversineDistance(currentPage.roadPath[0], fromGps) > 0.05 ||
          haversineDistance(currentPage.roadPath[currentPage.roadPath.length - 1], toGps) > 0.05;

        if (needsSnap) {
          const snappedPath = await snapLeg(fromGps, toGps);
          await db.pages.update(currentPage.id!, { roadPath: snappedPath });
          legUpdated = true;
        }
      } else {
        // No valid startLocation GPS, clear any stale roadPath on first page
        if (currentPage.roadPath !== null && currentPage.roadPath !== undefined) {
          await db.pages.update(currentPage.id!, { roadPath: null });
          legUpdated = true;
        }
      }
      continue;
    }

    const prevPage = sortedPages[i - 1];
    
    // Check if both pages have valid GPS points
    if (prevPage.location?.kind === 'gps' && currentPage.location?.kind === 'gps') {
      const fromGps = { lat: prevPage.location.lat, lng: prevPage.location.lng };
      const toGps = { lat: currentPage.location.lat, lng: currentPage.location.lng };
      
      // Check if we need to snap (either roadPath is missing, or endpoints changed)
      const needsSnap =
        !currentPage.roadPath ||
        currentPage.roadPath.length < 2 ||
        haversineDistance(currentPage.roadPath[0], fromGps) > 0.05 ||
        haversineDistance(currentPage.roadPath[currentPage.roadPath.length - 1], toGps) > 0.05;
        
      if (needsSnap) {
        const snappedPath = await snapLeg(fromGps, toGps);
        await db.pages.update(currentPage.id!, { roadPath: snappedPath });
        legUpdated = true;
      }
    } else {
      // If either location is named/none, clear any existing snapped path
      if (currentPage.roadPath !== null && currentPage.roadPath !== undefined) {
        await db.pages.update(currentPage.id!, { roadPath: null });
        legUpdated = true;
      }
    }
  }

  if (legUpdated) {
    console.log(`Finished road snaps backfilling for trip ${tripId}.`);
  }
}
