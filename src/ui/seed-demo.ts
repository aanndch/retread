import { db } from '../db';
import { DEMO_ROUTE_PATHS } from './demo-routes';

// Loads one of the bundled demo photos from Vite's `public/` dir (served at the
// root). Fetches are awaited up front, before any IndexedDB transaction opens —
// you cannot await an arbitrary fetch inside a `db.transaction` callback.
async function loadDemoPhoto(file: string): Promise<Blob> {
  const r = await fetch(`/demo-photos/${file}`);
  if (!r.ok) throw new Error(`Failed to load demo photo: ${file}`);
  return r.blob();
}

export async function seedDemoRide(): Promise<number> {
  // Preload the bundled real photos (varied aspect ratios) — the lightbox then
  // shows a mix of landscape, portrait, square and panorama shapes.
  const mountains = await loadDemoPhoto('mountains-800x600.jpg');   // 4:3
  const valley    = await loadDemoPhoto('valley-800x450.jpg');      // 16:9
  const peak      = await loadDemoPhoto('peak-portrait-600x800.jpg'); // 3:4
  const lake      = await loadDemoPhoto('lake-square-700x700.jpg');  // 1:1
  const ridge     = await loadDemoPhoto('ridge-panorama-1000x500.jpg'); // 2:1
  const road      = await loadDemoPhoto('road-900x600.jpg');         // 3:2

  // Write everything in a single transaction so the UI updates once (not once
  // per leg), which avoids the demo card flickering/animating as it appears.
  return db.transaction('rw', db.rides, db.legs, async () => {
  // Reused as the ride's home-page cover AND as the day-3 photo so the demo
  // shows off the user-picked cover feature (home renders coverBlob directly).
  const coverPhoto = mountains;

  const newRideId = await db.rides.add({
    title: "Western Ghats Loop",
    createdAt: new Date().toISOString(),
    startLocation: { kind: 'gps', lat: 12.2958, lng: 76.6394, name: "Mysore" },
    distanceMode: 'auto',
    coverBlob: coverPhoto
  }) as number;

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-14",
    time: "06:10",
    title: "Mysore to Madikeri (First climb into Coorg)",
    roadPath: DEMO_ROUTE_PATHS[0],
    note: "Rolled out of Mysore before the city woke up. Coffee plantations start right after the last town. The climb into Madikeri is tight and green—hairpins through cardamom shade. Stopped for filter coffee and a view across the Brahmagiri hills. Checked into a homestay surrounded by coffee estates.",
    km: 118,
    location: { kind: 'gps', lat: 12.4244, lng: 75.7382, name: "Madikeri" },
    photos: [
      valley,
      lake
    ]
  });

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-15",
    time: "07:45",
    title: "Madikeri to Kalpetta (Into Wayanad)",
    roadPath: DEMO_ROUTE_PATHS[1],
    note: "Took the little-known route via Virajpet, dropping down into the Wayanad plateau. The descent into Kalpetta is long and technical—road carved into the hillside. Mist rolled through the forest all morning. Crossed into Kerala at the border checkpoint and the tea shops changed from Kannada to Malayalam menus.",
    km: 122,
    location: { kind: 'gps', lat: 11.6107, lng: 76.0821, name: "Kalpetta" },
    photos: [
      road,
      peak
    ]
  });

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-16",
    time: "08:20",
    title: "Kalpetta to Kozhikode (Thamarassery ghat)",
    roadPath: DEMO_ROUTE_PATHS[2],
    note: "The Thamarassery ghat road has the famous 9 hairpins—each one tighter than the last. Caught up behind a loaded truck and was stuck crawling for the middle section. At the bottom the landscape flattened into coconut palms. Rode into Kozhikode in the late afternoon and ate the town's legendary biryani.",
    km: 92,
    location: { kind: 'gps', lat: 11.2588, lng: 75.7804, name: "Kozhikode" },
    photos: [
      coverPhoto
    ]
  });

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-17",
    time: "06:50",
    title: "Kozhikode to Thrissur",
    roadPath: DEMO_ROUTE_PATHS[3],
    note: "Coastal NH66 southbound. Dense traffic out of the city, but it thins out past Ponnani. Paddy fields on both sides. Short coffee stop at a roadside stall serving banana chips with chai.",
    km: 95,
    location: { kind: 'gps', lat: 10.5276, lng: 76.2144, name: "Thrissur" },
    photos: [
      ridge
    ]
  });

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-17",
    time: "14:30",
    title: "Thrissur to Kochi (Backwaters light)",
    roadPath: DEMO_ROUTE_PATHS[4],
    note: "Away from the highway onto the backroad through Angamaly. Long straights past banana plantations. Hit the metro outskirts by evening—ferry across to Fort Kochi was the perfect end to the day.",
    km: 110,
    location: { kind: 'gps', lat: 9.9667, lng: 76.2422, name: "Fort Kochi" },
    photos: [
      valley,
      mountains
    ]
  });

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-18",
    time: "07:05",
    title: "Kochi to Alleppey (Lazy canal country)",
    roadPath: DEMO_ROUTE_PATHS[5],
    note: "Short ride south down the peninsular coast. Turned off the highway for the backwater roads—narrow lanes running between canals and paddy. Spent the afternoon on a country boat. Flat light, green water, absolutely no rush.",
    km: 54,
    location: { kind: 'gps', lat: 9.4981, lng: 76.3388, name: "Alleppey" },
    photos: [
      road,
      peak
    ]
  });

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-19",
    time: "05:30",
    title: "Alleppey to Mysore (Home run)",
    roadPath: DEMO_ROUTE_PATHS[6],
    note: "The long haul home. Out before sunrise, through Kochi before traffic built up, then back over the ghats on the Palakkad gap. The Western Ghats felt different heading east—greener on the Kerala side, drier and brown by the time we crossed back into Karnataka. Rolled into Mysore in the dark, 385 km done.",
    km: 385,
    location: { kind: 'gps', lat: 12.2958, lng: 76.6394, name: "Mysore" },
    photos: [
      lake
    ]
  });

  return newRideId;
  });
}

// ---------------------------------------------------------------------------
// Phantom-flow demo ride (Spiti Circuit)
//
// Seeds data that exercises the pin-first + phantom-stop flow end to end:
//   1. a pinned leg (solid route)            — Manali → Rohtang
//   2. a NAME-ONLY leg (mid-ride PHANTOM)    — Rohtang → Kunzum La (no pin)
//   3. a pinned leg whose route spans the phantom gap (suppressed on the ride
//      map, replaced by dashed connectors)   — Kunzum La → Kaza
//   4. an UNNAMED GPS pin (labels "Stop 4")  — Kaza → Tabo
//   5. a TRAILING name-only leg (dashed stub off the last real pin) — Kalpa
//
// The mid-ride road paths are hand-drawn plausible lines, not OSRM snaps — the
// squiggle map only needs believable winding roads to show the contrast.
// ---------------------------------------------------------------------------
const SPITI_PATHS: { lat: number; lng: number }[][] = [
  [
    { lat: 32.2396, lng: 77.1887 },
    { lat: 32.2479, lng: 77.2016 },
    { lat: 32.2611, lng: 77.2158 },
    { lat: 32.2862, lng: 77.2286 },
    { lat: 32.3188, lng: 77.2391 },
    { lat: 32.3467, lng: 77.2456 },
    { lat: 32.3717, lng: 77.2467 },
  ],
  [
    { lat: 32.3717, lng: 77.2467 },
    { lat: 32.3941, lng: 77.3436 },
    { lat: 32.4028, lng: 77.62 },
    { lat: 32.3597, lng: 77.7234 },
    { lat: 32.3112, lng: 77.8469 },
    { lat: 32.2604, lng: 77.9503 },
    { lat: 32.2261, lng: 78.0766 },
  ],
  [
    { lat: 32.2261, lng: 78.0766 },
    { lat: 32.1876, lng: 78.1506 },
    { lat: 32.1411, lng: 78.2242 },
    { lat: 32.1136, lng: 78.2948 },
    { lat: 32.0911, lng: 78.3366 },
    { lat: 32.0804, lng: 78.3673 },
  ],
];

export async function seedPhantomDemoRide(): Promise<number> {
  const ridge = await loadDemoPhoto('ridge-panorama-1000x500.jpg'); // 2:1
  const mountains = await loadDemoPhoto('mountains-800x600.jpg');   // 4:3
  const valley    = await loadDemoPhoto('valley-800x450.jpg');      // 16:9
  const lake      = await loadDemoPhoto('lake-square-700x700.jpg'); // 1:1
  const peak      = await loadDemoPhoto('peak-portrait-600x800.jpg'); // 3:4

  return db.transaction('rw', db.rides, db.legs, async () => {
  const day2Photo = ridge;

  const newRideId = await db.rides.add({
    title: "Spiti Circuit (Phantom Demo)",
    createdAt: new Date().toISOString(),
    startLocation: { kind: 'gps', lat: 32.2396, lng: 77.1887, name: "Manali" },
    distanceMode: 'auto',
    coverBlob: day2Photo
  }) as number;

  // Pinned leg — solid route.
  await db.legs.add({
    rideId: newRideId,
    date: "2026-08-10",
    time: "07:15",
    title: "Manali to Rohtang Pass",
    roadPath: SPITI_PATHS[0],
    note: "Graded climb out of Manali, past the river gorges. Snow patches still at the top even in summer.",
    km: 51,
    location: { kind: 'gps', lat: 32.3717, lng: 77.2467, name: "Rohtang Pass" },
    photos: [
      mountains
    ]
  });

  // PHANTOM: name only, no GPS pin — a dashed gap on the ride map.
  await db.legs.add({
    rideId: newRideId,
    date: "2026-08-11",
    time: "08:40",
    title: "Rohtang to Kunzum La",
    note: "Long gravel climb to Kunzum La. Didn't drop a pin — phone was dead. The map shows this stop as approximate.",
    km: 72,
    location: { kind: 'named', name: 'Kunzum La' },
    photos: [
      day2Photo
    ]
  });

  // Pinned leg whose route spans the phantom gap: the ride map draws dashed
  // connectors through Kunzum instead of this solid path (leg detail still shows it).
  await db.legs.add({
    rideId: newRideId,
    date: "2026-08-12",
    time: "09:10",
    title: "Kunzum La to Kaza",
    roadPath: SPITI_PATHS[1],
    note: "Dropped down onto the Spiti river. Kaza felt like a desert town after two days of moonscape.",
    km: 70,
    location: { kind: 'gps', lat: 32.2261, lng: 78.0766, name: "Kaza" },
    photos: [
      valley
    ]
  });

  // Unnamed GPS pin — labels as "Stop 4".
  await db.legs.add({
    rideId: newRideId,
    date: "2026-08-13",
    time: "10:05",
    title: "Kaza to Tabo",
    roadPath: SPITI_PATHS[2],
    note: "Ride along the river to the thousand-year-old Tabo monastery. Never got round to naming the pin.",
    km: 47,
    location: { kind: 'gps', lat: 32.0804, lng: 78.3673 },
    photos: [
      lake
    ]
  });

  // TRAILING PHANTOM: no next real pin — gets a dashed stub off the last real stop.
  await db.legs.add({
    rideId: newRideId,
    date: "2026-08-14",
    time: "06:30",
    title: "Tabo to Kalpa",
    note: "Over the last pass and down to the apple orchards of Kalpa. Shut the map off after Tabo, so this stop is phantom too.",
    km: 118,
    location: { kind: 'named', name: 'Kalpa' },
    photos: [
      peak
    ]
  });

  return newRideId;
  });
}
