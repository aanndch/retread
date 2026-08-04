import { db } from '../db';
import { DEMO_ROUTE_PATHS } from './demo-routes';

function createMockPhoto(title: string, color: string) {
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <rect width="100%" height="100%" fill="${color}"/>
    <circle cx="400" cy="260" r="100" fill="none" stroke="#fafefe" stroke-width="2" opacity="0.3"/>
    <line x1="400" y1="60" x2="400" y2="460" stroke="#fafefe" stroke-width="1" opacity="0.2"/>
    <line x1="100" y1="260" x2="700" y2="260" stroke="#fafefe" stroke-width="1" opacity="0.2"/>
    <text x="50%" y="530" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="16" fill="#fafefe" letter-spacing="2">${escapedTitle.toUpperCase()}</text>
    <text x="50%" y="265" dominant-baseline="middle" text-anchor="middle" font-family="serif" font-size="32" font-style="italic" fill="#fafefe">RETREAD LOGS</text>
  </svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

export async function seedDemoRide(): Promise<number> {
  // Write everything in a single transaction so the UI updates once (not once
  // per leg), which avoids the demo card flickering/animating as it appears.
  return db.transaction('rw', db.rides, db.legs, async () => {
  const newRideId = await db.rides.add({
    title: "Western Ghats Loop",
    createdAt: new Date().toISOString(),
    startLocation: { kind: 'gps', lat: 12.2958, lng: 76.6394, name: "Mysore" },
    distanceMode: 'odo',
    startOdo: 21560
  }) as number;

  await db.legs.add({
    rideId: newRideId,
    date: "2026-07-14",
    time: "06:10",
    title: "Mysore to Madikeri (First climb into Coorg)",
    roadPath: DEMO_ROUTE_PATHS[0],
    note: "Rolled out of Mysore before the city woke up. Coffee plantations start right after the last town. The climb into Madikeri is tight and green—hairpins through cardamom shade. Stopped for filter coffee and a view across the Brahmagiri hills. Checked into a homestay surrounded by coffee estates.",
    km: 118,
    odo: 21678,
    location: { kind: 'gps', lat: 12.4244, lng: 75.7382, name: "Madikeri" },
    photos: [
      createMockPhoto("Day 1: Coffee estate ride", "#4a5d4e"),
      createMockPhoto("Day 1: Brahmagiri viewpoint", "#546469")
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
    odo: 21800,
    location: { kind: 'gps', lat: 11.6107, lng: 76.0821, name: "Kalpetta" },
    photos: [
      createMockPhoto("Day 2: Virajpet descent", "#695e54"),
      createMockPhoto("Day 2: Wayanad plateau mist", "#5c6d5f")
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
    odo: 21892,
    location: { kind: 'gps', lat: 11.2588, lng: 75.7804, name: "Kozhikode" },
    photos: [
      createMockPhoto("Day 3: Nine hairpins", "#586954")
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
    odo: 21987,
    location: { kind: 'gps', lat: 10.5276, lng: 76.2144, name: "Thrissur" },
    photos: [
      createMockPhoto("Day 4a: Coastal NH66", "#6e6255")
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
    odo: 22097,
    location: { kind: 'gps', lat: 9.9667, lng: 76.2422, name: "Fort Kochi" },
    photos: [
      createMockPhoto("Day 4b: Fort Kochi ferry", "#4b5b5c"),
      createMockPhoto("Day 4b: Chinese fishing nets", "#6e5d5c")
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
    odo: 22151,
    location: { kind: 'gps', lat: 9.4981, lng: 76.3388, name: "Alleppey" },
    photos: [
      createMockPhoto("Day 5: Backwater canal", "#4a5d4e"),
      createMockPhoto("Day 5: Country boat", "#5c6d5f")
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
    odo: 22536,
    location: { kind: 'gps', lat: 12.2958, lng: 76.6394, name: "Mysore" },
    photos: [
      createMockPhoto("Day 6: Palakkad gap climb", "#6e6255")
    ]
  });

  return newRideId;
  });
}
