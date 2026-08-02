import { useState, useRef } from 'preact/hooks';
import { db } from '../db';
import type { Trip, LocationUnion } from '../types';

interface BackupProps {
  onNavigate: (route: string) => void;
}

interface BackupPayload {
  version: 1;
  trips: Trip[];
  pages: {
    tripId: number;
    date: string;
    note: string;
    km: number | null;
    odo: number | null;
    location: LocationUnion | null;
    roadPath: { lat: number; lng: number }[] | null;
    photos: string[]; // Base64 Data URLs
  }[];
}

export function Backup({ onNavigate }: BackupProps) {
  const [working, setWorking] = useState(false);
  const [statusText, setStatusText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Convert Blob to Base64 Data URL
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Helper: Convert Base64 Data URL back to Blob
  const base64ToBlob = async (base64Url: string): Promise<Blob> => {
    const res = await fetch(base64Url);
    return await res.blob();
  };

  // 1. Export Backup Routine
  const handleExport = async () => {
    setWorking(true);
    setStatusText('Preparing export package...');
    
    try {
      const trips = await db.trips.toArray();
      const pages = await db.pages.toArray();
      
      setStatusText(`Serializing database logs (${trips.length} trips, ${pages.length} days)...`);
      
      const serializedPages = [];
      for (const page of pages) {
        setStatusText(`Encoding photos for page on ${page.date}...`);
        
        // Convert all photo blobs to base64 strings
        const base64Photos = [];
        if (page.photos) {
          for (const blob of page.photos) {
            const base64 = await blobToBase64(blob);
            base64Photos.push(base64);
          }
        }
        
        serializedPages.push({
          tripId: page.tripId,
          date: page.date,
          note: page.note,
          km: page.km ?? null,
          odo: page.odo ?? null,
          location: page.location ?? null,
          roadPath: page.roadPath ?? null,
          photos: base64Photos
        });
      }
      
      const payload: BackupPayload = {
        version: 1,
        trips,
        pages: serializedPages
      };
      
      // Trigger File Download in browser
      const jsonString = JSON.stringify(payload);
      const jsonBlob = new Blob([jsonString], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(jsonBlob);
      
      const dateTag = new Date().toISOString().split('T')[0];
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `retread-backup-${dateTag}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      
      // Cleanup
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
      
      setStatusText('Backup file generated successfully.');
    } catch (err) {
      console.error('Backup export failed:', err);
      alert('Failed to generate backup file.');
      setStatusText('Export failed.');
    } finally {
      setWorking(false);
    }
  };

  // 2. Import Backup Routine
  const handleImport = async (e: any) => {
    const files = e.target.files as FileList;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const confirmRestore = confirm(
      'WARNING: Restoring this backup will overwrite all current logs and database records on this device. Do you wish to proceed?'
    );
    if (!confirmRestore) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setWorking(true);
    setStatusText('Reading backup package...');
    
    try {
      const reader = new FileReader();
      
      const parsedData = await new Promise<BackupPayload>((resolve, reject) => {
        reader.onload = () => {
          try {
            const json = JSON.parse(reader.result as string);
            resolve(json);
          } catch (err) {
            reject(new Error('Invalid JSON format in backup file.'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });
      
      // Basic schema validations
      if (parsedData.version !== 1 || !Array.isArray(parsedData.trips) || !Array.isArray(parsedData.pages)) {
        throw new Error('Unsupported or corrupted backup schema.');
      }
      
      setStatusText('Clearing local database tables...');
      
      // Clean DB tables
      await db.trips.clear();
      await db.pages.clear();
      
      setStatusText('Restoring trip indexes...');
      
      // Map old trip IDs to new database auto-incremented IDs
      const tripIdMapping = new Map<number, number>();
      for (const trip of parsedData.trips) {
        const oldId = trip.id;
        // Strip auto-increment ID to let Dexie assign fresh keys
        delete trip.id;
        const newId = await db.trips.add(trip) as number;
        if (oldId !== undefined) {
          tripIdMapping.set(oldId, newId);
        }
      }
      
      setStatusText('Decoding and restoring day logs (this may take a few moments)...');
      
      for (const page of parsedData.pages) {
        const mappedTripId = tripIdMapping.get(page.tripId);
        if (mappedTripId === undefined) {
          console.warn(`Skipping page on ${page.date} due to missing trip index.`);
          continue;
        }
        
        // Decode base64 strings back to binary Blobs
        const photoBlobs = [];
        if (page.photos) {
          for (const base64 of page.photos) {
            const blob = await base64ToBlob(base64);
            photoBlobs.push(blob);
          }
        }
        
        await db.pages.add({
          tripId: mappedTripId,
          date: page.date,
          note: page.note,
          photos: photoBlobs,
          km: page.km,
          odo: page.odo,
          location: page.location,
          roadPath: page.roadPath
        });
      }
      
      setStatusText('Restore finished successfully.');
      alert('Logs database successfully restored!');
      
      // Clear input and redirect
      if (fileInputRef.current) fileInputRef.current.value = '';
      onNavigate('#/');
    } catch (err: any) {
      console.error('Backup import failed:', err);
      alert(`Import failed: ${err.message || 'Unknown error'}`);
      setStatusText('Import failed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setWorking(false);
    }
  };

  return (
    <div class="backup-container">
      <header class="backup-header">
        <button 
          class="btn-icon" 
          aria-label="Back" 
          onClick={() => onNavigate('#/')}
          disabled={working}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="12" x2="2" y2="12"></line>
            <polyline points="9 19 2 12 9 5"></polyline>
          </svg>
        </button>
        <h3>Backup & Restore</h3>
      </header>

      <main class="backup-card">
        <p class="backup-description">
          Retread stores all data locally in IndexedDB. Use these tools to back up your logbooks regularly or migrate your data to another device.
        </p>

        {statusText && (
          <div class="backup-status">
            <span class="status-indicator">✦</span>
            <p>{statusText}</p>
          </div>
        )}

        <div class="backup-actions">
          {/* Export Action */}
          <div class="action-section">
            <h4>Export Database</h4>
            <p class="action-help">Downloads all rides, daily logs, coordinates, and photo attachments as a single JSON file.</p>
            <button 
              class="btn btn-primary" 
              onClick={handleExport} 
              disabled={working}
            >
              {working ? 'Exporting...' : 'Export Backup File'}
            </button>
          </div>

          <hr class="divider" />

          {/* Import Action */}
          <div class="action-section">
            <h4>Import Database</h4>
            <p class="action-help">Restores rides from a previously exported JSON backup. This replaces all logs currently on this device.</p>
            
            <input 
              type="file" 
              ref={fileInputRef}
              accept=".json" 
              onChange={handleImport}
              id="backup-import" 
              class="file-hidden-input"
              disabled={working}
            />
            <label for="backup-import" class={`btn btn-secondary ${working ? 'disabled' : ''}`}>
              {working ? 'Restoring...' : 'Select Backup File'}
            </label>
          </div>
        </div>
      </main>
    </div>
  );
}
