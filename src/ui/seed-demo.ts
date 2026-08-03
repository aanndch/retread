import { db } from '../db';
import { backfillTripRoutes } from '../road';

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
  const newTripId = await db.trips.add({
    title: "Spiti Valley Loop",
    createdAt: new Date().toISOString(),
    startLocation: { kind: 'gps', lat: 31.1048, lng: 77.1734, name: "Shimla" },
    distanceMode: 'odo',
    startOdo: 12480
  }) as number;

  await db.pages.add({
    tripId: newTripId,
    date: "2026-06-10",
    time: "06:30",
    title: "Shimla to Sarahan (Gateway to Kinnaur)",
    note: "Left Shimla at dawn. The air is crisp and clean as we climb away from the tourist crowds. Navigating the winding tarmac towards Narkanda, the cedar forests smell amazing. Descended into the Sutlej river valley before climbing up to the quiet temple town of Sarahan. Staying in a small guesthouse facing the snow-capped Shrikhand Mahadev peaks.",
    km: 160,
    odo: 12640,
    location: { kind: 'gps', lat: 31.5173, lng: 77.7958, name: "Sarahan" },
    photos: [
      createMockPhoto("Day 1: Winding roads", "#4a5d4e"),
      createMockPhoto("Day 1: Sutlej River Valley", "#5c6d5f")
    ]
  });

  await db.pages.add({
    tripId: newTripId,
    date: "2026-06-11",
    time: "07:15",
    title: "Sarahan to Sangla (Into Baspa Valley)",
    note: "Rode along the sheer cliff faces of the Hindustan-Tibet Highway. The roads are carved directly into rock here—half-tunnels hanging over the raging Sutlej. Turned off at Karcham into the breathtaking Baspa Valley. The river is turquoise. Camped under the apple orchards in Sangla. Felt the altitude creeping in.",
    km: 95,
    odo: 12735,
    location: { kind: 'gps', lat: 31.4239, lng: 78.2612, name: "Sangla" },
    photos: [
      createMockPhoto("Day 2: Kinnaur Cliffs", "#695e54"),
      createMockPhoto("Day 2: Baspa River Camp", "#546469")
    ]
  });

  await db.pages.add({
    tripId: newTripId,
    date: "2026-06-12",
    time: "08:00",
    title: "Sangla to Kalpa (Kinnaur Kailash peaks)",
    note: "A short but demanding climb up to Kalpa. Rode through Chitkul—the last Indian village before the Tibet border. The wind was fierce, cold, and pure. Reached Kalpa by afternoon. The giant Kinnaur Kailash massif dominates the sky. Golden hour hitting the peaks was surreal.",
    km: 80,
    odo: 12815,
    location: { kind: 'gps', lat: 31.5385, lng: 78.2561, name: "Kalpa" },
    photos: [
      createMockPhoto("Day 3: Border Outpost in Chitkul", "#586954")
    ]
  });

  await db.pages.add({
    tripId: newTripId,
    date: "2026-06-13",
    time: "06:45",
    title: "Kalpa to Nako (High-Altitude Desert)",
    note: "Crossed the Khab bridge where Sutlej meets Spiti river. The landscape transitioned from green pine valleys into completely barren, lunar-like brown mountains. Constant wind and gravel patches. Climbed the hairpin loops up to Nako, an ancient village built around a small lake at 3,600m. Visited the 1000-year-old monastery.",
    km: 125,
    odo: 12940,
    location: { kind: 'gps', lat: 31.8797, lng: 78.6276, name: "Nako" },
    photos: [
      createMockPhoto("Day 4: Khab Bridge Junction", "#6e6255")
    ]
  });

  await db.pages.add({
    tripId: newTripId,
    date: "2026-06-14",
    time: "07:30",
    title: "Nako to Kaza (Heart of Spiti)",
    note: "Rode through the Spiti Valley river bed. Stopped at Tabo Monastery—often called the Ajanta of the Himalayas. The dirt trails leading into Dhankar Monastery were tricky but the views were worth the near-drop. Arrived in Kaza, the sub-divisional capital. Thin air, fluttering prayer flags, and local butter tea.",
    km: 115,
    odo: 13055,
    location: { kind: 'gps', lat: 32.2227, lng: 78.0709, name: "Kaza" },
    photos: [
      createMockPhoto("Day 5: Entering Kaza Valley", "#4b5b5c"),
      createMockPhoto("Day 5: Dhankar Monastery Ridge", "#6e5d5c")
    ]
  });

  await backfillTripRoutes(newTripId);

  return newTripId;
}
