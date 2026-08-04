import { db } from './db';
import { 
  SNAP_THRESHOLD_KM, 
  OSRM_DRIVING_BASE_URL, 
  DIRECT_DIST_LIMIT_KM, 
  DETOUR_RATIO_LONG, 
  DETOUR_FLAT_SHORT_KM 
} from './constants';

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
  if (directDist < SNAP_THRESHOLD_KM) {
    return [from, to];
  }

  try {
    const url = `${OSRM_DRIVING_BASE_URL}${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM API error: ${res.statusText}`);
    }
    
    const data = await res.json();
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const osrmKm = route.distance / 1000;
      
      // Safeguard: If OSRM distance is > DETOUR_RATIO_LONG * direct distance AND direct distance is significant, drop snap
      const isDetour = directDist > DIRECT_DIST_LIMIT_KM 
        ? (osrmKm > DETOUR_RATIO_LONG * directDist) 
        : (osrmKm > DETOUR_FLAT_SHORT_KM);
      if (isDetour) {
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
    console.error(`OSRM snapping failed: ${err}`);
    throw err;
  }
}

// Retroactive Snapper: Backfills missing road paths for all legs of a ride
export async function backfillRideRoutes(rideId: number): Promise<void> {
  // Query all legs for the ride sorted chronologically
  const legs = await db.legs.where('rideId').equals(rideId).toArray();
  const sortedLegs = [...legs].sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    const tA = a.time || '00:00';
    const tB = b.time || '00:00';
    return tA.localeCompare(tB) || (a.id || 0) - (b.id || 0);
  });

  // Load the ride record to get the departure pin
  const rideRecord = await db.rides.get(rideId);

  for (let i = 0; i < sortedLegs.length; i++) {
    const currentLeg = sortedLegs[i];
    
    // First leg: use Ride.startLocation as the departure point
    if (i === 0) {
      if (rideRecord?.startLocation?.kind === 'gps' && currentLeg.location?.kind === 'gps') {
        const fromGps = { lat: rideRecord.startLocation.lat, lng: rideRecord.startLocation.lng };
        const toGps = { lat: currentLeg.location.lat, lng: currentLeg.location.lng };

        const needsSnap =
          !currentLeg.roadPath ||
          currentLeg.roadPath.length <= 2 ||
          haversineDistance(currentLeg.roadPath[0], fromGps) > 0.05 ||
          haversineDistance(currentLeg.roadPath[currentLeg.roadPath.length - 1], toGps) > 0.05;

        if (needsSnap) {
          try {
            const snappedPath = await snapLeg(fromGps, toGps);
            await db.legs.update(currentLeg.id!, { roadPath: snappedPath });
          } catch (snapErr) {
            console.warn(`[OSRM] Snap failed for first leg, saving straight line fallback:`, snapErr);
            await db.legs.update(currentLeg.id!, { roadPath: [fromGps, toGps] });
          }
        }
      } else {
        // No valid startLocation GPS, clear any stale roadPath on first leg
        if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
          await db.legs.update(currentLeg.id!, { roadPath: null });
        }
      }
      continue;
    }

    const prevLeg = sortedLegs[i - 1];
    
    // Check if both legs have valid GPS points
    if (prevLeg.location?.kind === 'gps' && currentLeg.location?.kind === 'gps') {
      const fromGps = { lat: prevLeg.location.lat, lng: prevLeg.location.lng };
      const toGps = { lat: currentLeg.location.lat, lng: currentLeg.location.lng };
      
      // Check if we need to snap (either roadPath is missing, or endpoints changed)
      const needsSnap =
        !currentLeg.roadPath ||
        currentLeg.roadPath.length <= 2 ||
        haversineDistance(currentLeg.roadPath[0], fromGps) > 0.05 ||
        haversineDistance(currentLeg.roadPath[currentLeg.roadPath.length - 1], toGps) > 0.05;
        
      if (needsSnap) {
        try {
          const snappedPath = await snapLeg(fromGps, toGps);
          await db.legs.update(currentLeg.id!, { roadPath: snappedPath });
        } catch (snapErr) {
          console.warn(`[OSRM] Snap failed for leg, saving straight line fallback:`, snapErr);
          await db.legs.update(currentLeg.id!, { roadPath: [fromGps, toGps] });
        }
      }
    } else {
      // If either location is named/none, clear any existing snapped path
      if (currentLeg.roadPath !== null && currentLeg.roadPath !== undefined) {
        await db.legs.update(currentLeg.id!, { roadPath: null });
      }
    }
  }
}
