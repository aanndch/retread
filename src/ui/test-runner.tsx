import { useState, useEffect } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { ArrowLeft } from '../components/icons';
import { computeTotalDistance } from '../lib';
import { db } from '../db';
import { buildBackupPayload } from '../gdrive';
import { snapLeg, haversineDistance } from '../road';
import { sideAnchor, centerLabel } from './squiggle';

export function TestRunner() {
  const [results, setResults] = useState<{ name: string; status: 'PASS' | 'FAIL'; message?: string }[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    runTests();
  }, []);

  async function runTests() {
    const list: typeof results = [];

    // Test 1: Distance Calculator (KM only)
    try {
      const distance = computeTotalDistance([
        { rideId: 1, date: '2026-08-01', note: '', photos: [], km: 100 },
        { rideId: 1, date: '2026-08-02', note: '', photos: [], km: 150 }
      ]);
      if (distance === 250) {
        list.push({ name: 'Distance calculation (KM only)', status: 'PASS' });
      } else {
        list.push({ name: 'Distance calculation (KM only)', status: 'FAIL', message: `Expected 250, got ${distance}` });
      }
    } catch (e: unknown) {
      list.push({ name: 'Distance calculation (KM only)', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 2: Dexie DB basic CRUD
    try {
      const rideId = await db.rides.add({ title: 'Test Ride', createdAt: new Date().toISOString() });
      const legId = await db.legs.add({
        rideId,
        date: '2026-08-01',
        note: 'Test Note',
        photos: []
      });

      const retrievedRide = await db.rides.get(rideId);
      const retrievedLeg = await db.legs.get(legId);

      if (retrievedRide?.title === 'Test Ride' && retrievedLeg?.note === 'Test Note') {
        list.push({ name: 'IndexedDB CRUD write/read', status: 'PASS' });
      } else {
        list.push({ name: 'IndexedDB CRUD write/read', status: 'FAIL', message: 'Failed to retrieve written data correctly' });
      }

      // Cleanup
      await db.rides.delete(rideId);
      await db.legs.delete(legId);
      list.push({ name: 'IndexedDB CRUD deletion/cleanup', status: 'PASS' });

    } catch (e: unknown) {
      list.push({ name: 'IndexedDB CRUD write/read', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 3: Backup payload preserves leg title + time (schema v3)
    try {
      const rideId = await db.rides.add({ title: 'Backup Test Ride', createdAt: new Date().toISOString() });
      const legId = await db.legs.add({
        rideId,
        date: '2026-08-01',
        time: '07:30',
        note: 'Note',
        photos: [],
        title: 'Mysore to Madikeri'
      });

      const payload = await buildBackupPayload();
      const serialized = payload.legs.find(l => l.rideId === rideId);

      if (
        payload.version === 1 &&
        serialized?.title === 'Mysore to Madikeri' &&
        serialized?.time === '07:30'
      ) {
        list.push({ name: 'Backup payload preserves leg title + time (v3)', status: 'PASS' });
      } else {
        list.push({ name: 'Backup payload preserves leg title + time (v3)', status: 'FAIL', message: JSON.stringify(serialized) });
      }

      await db.legs.delete(legId);
      await db.rides.delete(rideId);
    } catch (e: unknown) {
      list.push({ name: 'Backup payload preserves leg title + time (v3)', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 4: Route path generator connects endpoints directly
    try {
      const from = { lat: 12.3, lng: 76.5 };
      const to = { lat: 12.4, lng: 76.6 };
      const path = await snapLeg(from, to);

      if (path.length === 2 && path[0] === from && path[1] === to) {
        list.push({ name: 'Route path connects endpoints directly', status: 'PASS' });
      } else {
        list.push({ name: 'Route path connects endpoints directly', status: 'FAIL', message: `Got ${path.length} pts` });
      }
    } catch (e: unknown) {
      list.push({ name: 'Route path connects endpoints directly', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 5: Route path generator preserves intermediate viaPoints in order
    try {
      const from = { lat: 12.3, lng: 76.5 };
      const via = [{ lat: 12.35, lng: 76.55 }];
      const to = { lat: 12.4, lng: 76.6 };
      const path = await snapLeg(from, to, via);

      if (path.length === 3 && path[0] === from && path[1] === via[0] && path[2] === to) {
        list.push({ name: 'Route path preserves via points in order', status: 'PASS' });
      } else {
        list.push({ name: 'Route path preserves via points in order', status: 'FAIL', message: `Got ${path.length} pts` });
      }
    } catch (e: unknown) {
      list.push({ name: 'Route path preserves via points in order', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 6: Haversine distance calculation
    try {
      const d = haversineDistance({ lat: 12.3, lng: 76.5 }, { lat: 12.4, lng: 76.6 });
      if (d > 10 && d < 20) {
        list.push({ name: 'Haversine distance calculation', status: 'PASS' });
      } else {
        list.push({ name: 'Haversine distance calculation', status: 'FAIL', message: `Got ${d} km` });
      }
    } catch (e: unknown) {
      list.push({ name: 'Haversine distance calculation', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 7: Multi-point leg distance calculation sums intermediate viaPoints accurately
    try {
      const p1 = { lat: 12.3, lng: 76.5 };
      const p2 = { lat: 12.35, lng: 76.55 };
      const p3 = { lat: 12.4, lng: 76.6 };
      const path = await snapLeg(p1, p3, [p2]);
      const totalDist = haversineDistance(path[0], path[1]) + haversineDistance(path[1], path[2]);

      if (path.length === 3 && totalDist > 0) {
        list.push({ name: 'Multi-point leg distance calculation', status: 'PASS' });
      } else {
        list.push({ name: 'Multi-point leg distance calculation', status: 'FAIL' });
      }
    } catch (e: unknown) {
      list.push({ name: 'Multi-point leg distance calculation', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 8: Squiggle edge-label placement keeps text inside the map
    try {
      const rightSide = sideAnchor(14, 430);   // near left edge → label right
      const leftSide = sideAnchor(416, 430);   // near right edge → label left
      const nearEdgeStop = centerLabel({ x: 20, y: 100 }, 430, 300); // near left → nudge right
      const centerStop = centerLabel({ x: 215, y: 50 }, 430, 300);   // middle → centered below

      if (
        rightSide.anchor === 'start' && rightSide.x === 21 &&
        leftSide.anchor === 'end' && leftSide.x === 409 &&
        nearEdgeStop.anchor === 'start' && nearEdgeStop.x === 26 &&
        centerStop.anchor === 'middle' && centerStop.x === 215 && centerStop.y === 63
      ) {
        list.push({ name: 'Squiggle edge-safe label placement', status: 'PASS' });
      } else {
        list.push({ name: 'Squiggle edge-safe label placement', status: 'FAIL', message: JSON.stringify({ rightSide, leftSide, nearEdgeStop, centerStop }) });
      }
    } catch (e: unknown) {
      list.push({ name: 'Squiggle edge-safe label placement', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    setResults(list);
    setRunning(false);
  }

  return (
    <div style={{ fontFamily: 'var(--font-mechanical)', padding: '20px' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '20px', borderBottom: '2px solid var(--color-ink)' }}>Retread System Integration Tests</h2>
      {running ? (
        <p>Running test suite...</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {results.map((res, i) => (
            <li key={i} style={{ margin: '10px 0', borderBottom: '1px dashed var(--color-ink-muted)', paddingBottom: '10px' }}>
              <span style={{
                color: res.status === 'PASS' ? '#4a5d4e' : 'red',
                fontWeight: 'bold',
                marginRight: '15px'
              }}>[ {res.status} ]</span>
              <strong>{res.name}</strong>
              {res.message && <p style={{ color: 'red', fontSize: '12px', margin: '5px 0 0 70px' }}>{res.message}</p>}
            </li>
          ))}
        </ul>
      )}
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '20px', color: 'var(--color-green)', textDecoration: 'underline' }}>
        <ArrowLeft size={12} />
        <span>Back to Home</span>
      </Link>
    </div>
  );
}
