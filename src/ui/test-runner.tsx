import { useState, useEffect } from 'preact/hooks';
import { ArrowLeft } from '../components/icons';
import { computeTotalDistance } from '../lib';
import { db } from '../db';

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

    // Test 2: Distance Calculator (ODO only)
    try {
      const distance = computeTotalDistance([
        { rideId: 1, date: '2026-08-01', note: '', photos: [], odo: 1000 },
        { rideId: 1, date: '2026-08-02', note: '', photos: [], odo: 1250 },
        { rideId: 1, date: '2026-08-03', note: '', photos: [], odo: 1300 }
      ]);
      if (distance === 300) {
        list.push({ name: 'Distance calculation (ODO only)', status: 'PASS' });
      } else {
        list.push({ name: 'Distance calculation (ODO only)', status: 'FAIL', message: `Expected 300, got ${distance}` });
      }
    } catch (e: unknown) {
      list.push({ name: 'Distance calculation (ODO only)', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 3: Distance Calculator (Mixed KM and ODO)
    try {
      const distance = computeTotalDistance([
        { rideId: 1, date: '2026-08-01', note: '', photos: [], odo: 1000 }, // anchor
        { rideId: 1, date: '2026-08-02', note: '', photos: [], km: 50 },     // direct km: total = 50
        { rideId: 1, date: '2026-08-03', note: '', photos: [], odo: 1120 },  // odo difference: 1120 - 1000 = 120. total = 170
        { rideId: 1, date: '2026-08-04', note: '', photos: [], odo: 1150 }   // odo difference: 1150 - 1120 = 30. total = 200
      ]);
      if (distance === 200) {
        list.push({ name: 'Distance calculation (Mixed KM & ODO)', status: 'PASS' });
      } else {
        list.push({ name: 'Distance calculation (Mixed KM & ODO)', status: 'FAIL', message: `Expected 200, got ${distance}` });
      }
    } catch (e: unknown) {
      list.push({ name: 'Distance calculation (Mixed KM & ODO)', status: 'FAIL', message: e instanceof Error ? e.message : 'Unknown error' });
    }

    // Test 4: Dexie DB basic CRUD
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
