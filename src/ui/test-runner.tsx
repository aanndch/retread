import { useState, useEffect } from 'preact/hooks';
import { ArrowLeft } from '../components/icons';
import { computeTotalDistance } from '../lib';
import { db } from '../db';
import { buildBackupPayload } from '../gdrive';
import { snapLeg } from '../road';
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

    // Test 4: OSRM snap success path parses GeoJSON route
    try {
      const realFetch = window.fetch;
      try {
        const fakeRoute = {
          code: 'Ok',
          routes: [{ distance: 12000, geometry: { coordinates: [[76.5, 12.3], [76.6, 12.4]] } }]
        };
        window.fetch = (async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => fakeRoute })) as unknown as typeof fetch;

        const path = await snapLeg({ lat: 12.3, lng: 76.5 }, { lat: 12.4, lng: 76.6 });

        if (path.length === 2 && path[0].lat === 12.3 && path[1].lat === 12.4) {
          list.push({ name: 'OSRM snap success path', status: 'PASS' });
        } else {
          list.push({ name: 'OSRM snap success path', status: 'FAIL', message: `Got ${path.length} pts` });
        }
      } finally {
        window.fetch = realFetch;
      }
    } catch (e: unknown) {
      list.push({ name: 'OSRM snap success path', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 5: OSRM snap falls back to straight line when all hosts fail
    try {
      const realFetch = window.fetch;
      try {
        window.fetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;

        const from = { lat: 12.3, lng: 76.5 };
        const to = { lat: 12.4, lng: 76.6 };
        const path = await snapLeg(from, to);

        if (path.length === 2 && path[0] === from && path[1] === to) {
          list.push({ name: 'OSRM snap straight-line fallback on failure', status: 'PASS' });
        } else {
          list.push({ name: 'OSRM snap straight-line fallback on failure', status: 'FAIL' });
        }
      } finally {
        window.fetch = realFetch;
      }
    } catch (e: unknown) {
      list.push({ name: 'OSRM snap straight-line fallback on failure', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 6: OSRM snap tries fallback host after primary failure
    try {
      const realFetch = window.fetch;
      try {
        let calls = 0;
        const fakeRoute = {
          code: 'Ok',
          routes: [{ distance: 12000, geometry: { coordinates: [[76.5, 12.3], [76.6, 12.4]] } }]
        };
        window.fetch = (async () => {
          calls++;
          if (calls === 1) throw new Error('primary host down');
          return { ok: true, status: 200, json: async () => fakeRoute };
        }) as unknown as typeof fetch;

        const path = await snapLeg({ lat: 12.3, lng: 76.5 }, { lat: 12.4, lng: 76.6 });

        if (path.length === 2 && calls === 2) {
          list.push({ name: 'OSRM snap fallback host recovery', status: 'PASS' });
        } else {
          list.push({ name: 'OSRM snap fallback host recovery', status: 'FAIL', message: `calls=${calls}` });
        }
      } finally {
        window.fetch = realFetch;
      }
    } catch (e: unknown) {
      list.push({ name: 'OSRM snap fallback host recovery', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 7: OSRM snap splits very long legs into hops
    try {
      const realFetch = window.fetch;
      try {
        const fakeRoute = {
          code: 'Ok',
          routes: [{ distance: 80000, geometry: { coordinates: [[76.5, 12.3], [76.6, 12.4]] } }]
        };
        window.fetch = (async () => ({ ok: true, status: 200, json: async () => fakeRoute })) as unknown as typeof fetch;

        // ~400km leg → should split into multiple hops without throwing
        const path = await snapLeg({ lat: 12.3, lng: 76.5 }, { lat: 16.0, lng: 80.0 });

        if (path.length >= 2) {
          list.push({ name: 'OSRM snap long-leg midpoint splitting', status: 'PASS' });
        } else {
          list.push({ name: 'OSRM snap long-leg midpoint splitting', status: 'FAIL', message: `Got ${path.length} pts` });
        }
      } finally {
        window.fetch = realFetch;
      }
    } catch (e: unknown) {
      list.push({ name: 'OSRM snap long-leg midpoint splitting', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
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
      <a href="#/" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '20px', color: 'var(--color-green)', textDecoration: 'underline' }}>
        <ArrowLeft size={12} />
        <span>Back to Home</span>
      </a>
    </div>
  );
}
