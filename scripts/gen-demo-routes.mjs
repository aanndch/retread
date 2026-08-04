// Generates src/ui/demo-routes.ts by snapping the demo ride's legs to real
// roads via OSRM. Run: node gen-demo-routes.mjs (from the repo root).
// Output paths are simplified to ~250 points (the squiggle renderer re-simplifies
// to 200 at draw time, so visual fidelity is preserved while keeping the bundle
// small and the demo seed instant + offline).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PRIMARY = 'https://router.project-osrm.org/route/v1/driving/';
const FALLBACK = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
const TIMEOUT_MS = 20000;
const LONG_LEG_SPLIT_KM = 180;
const MAX_POINTS = 250;

const R = 6371;
function haversineKm(p1, p2) {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((p1.lat * Math.PI) / 180) * Math.cos((p2.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolateWaypoints(from, to, count) {
  const pts = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    pts.push({ lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t });
  }
  return pts;
}

async function fetchRoute(from, to) {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  for (const baseUrl of [PRIMARY, FALLBACK]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const url = `${baseUrl}${coords}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        console.warn(`  ${baseUrl} HTTP ${res.status}; trying next host`);
        continue;
      }
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0 && data.routes[0].geometry?.coordinates) {
        return data.routes[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      }
      console.warn(`  ${baseUrl} no usable route; trying next host`);
    } catch (err) {
      console.warn(`  ${baseUrl} failed: ${err.message}; trying next host`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`OSRM failed for ${coords}`);
}

// Snap one from->to pair, splitting marathon legs into hops like snapLeg().
async function snapPair(from, to) {
  const directKm = haversineKm(from, to);
  const hopCount = Math.max(1, Math.ceil(directKm / LONG_LEG_SPLIT_KM));
  const waypoints = [from, ...interpolateWaypoints(from, to, hopCount - 1), to];
  const segments = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    segments.push(await fetchRoute(waypoints[i], waypoints[i + 1]));
  }
  const joined = [];
  for (const seg of segments) {
    if (joined.length > 0 && seg.length > 0) joined.push(...seg.slice(1));
    else joined.push(...seg);
  }
  return joined;
}

function distToSegment(p, a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.lng - (a.lng + t * dx), p.lat - (a.lat + t * dy));
}

function rdp(pts, tol) {
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tol && pts.length > 2) {
    const left = rdp(pts.slice(0, idx + 1), tol);
    const right = rdp(pts.slice(idx), tol);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

function simplify(pts, maxPoints) {
  let tol = 0.0004;
  let out = pts;
  while (out.length > maxPoints && tol < 0.2) {
    out = rdp(pts, tol);
    tol *= 1.6;
  }
  return out;
}

// The demo ride: [startLocation, ...legLocations]. Last leg (Alleppey->Mysore)
// is 385km and gets hop-split; the rest are single calls.
const MYSORE = { lat: 12.2958, lng: 76.6394 };
const stops = [
  { lat: 12.4244, lng: 75.7382 }, // Madikeri
  { lat: 11.6107, lng: 76.0821 }, // Kalpetta
  { lat: 11.2588, lng: 75.7804 }, // Kozhikode
  { lat: 10.5276, lng: 76.2144 }, // Thrissur
  { lat: 9.9667, lng: 76.2422 }, // Kochi
  { lat: 9.4981, lng: 76.3388 }, // Alleppey
  MYSORE, // home run
];

const pairs = [
  [MYSORE, stops[0]],
  [stops[0], stops[1]],
  [stops[1], stops[2]],
  [stops[2], stops[3]],
  [stops[3], stops[4]],
  [stops[4], stops[5]],
  [stops[5], stops[6]],
];

const paths = [];
for (let i = 0; i < pairs.length; i++) {
  const [from, to] = pairs[i];
  process.stdout.write(`Snapping leg ${i + 1} (${haversineKm(from, to).toFixed(0)}km)... `);
  const raw = await snapPair(from, to);
  const pts = simplify(raw, MAX_POINTS);
  paths.push(pts);
  console.log(`${raw.length} raw -> ${pts.length} points`);
}

const body = paths
  .map(
    (path) =>
      `  [\n${path
        .map((p) => `    { lat: ${p.lat}, lng: ${p.lng} },`)
        .join('\n')}\n  ],`
  )
  .join('\n\n');

const out = `/**
 * Pre-snapped road paths for the Western Ghats demo ride, generated once from
 * OSRM so seeding the demo is instant and offline. Regenerate with
 * scripts/gen-demo-routes.mjs when the demo legs change.
 *
 * Index matches the leg insert order in src/ui/seed-demo.ts (leg 7 is the
 * Alleppey->Mysore home run, joined from its hop-split segments).
 */
export const DEMO_ROUTE_PATHS: { lat: number; lng: number }[][] = [
${body}
];
`;

const target = join(process.cwd(), 'src', 'ui', 'demo-routes.ts');
writeFileSync(target, out, 'utf8');
console.log(`\nWrote ${target} (${paths.reduce((n, p) => n + p.length, 0)} points total)`);
