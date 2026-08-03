import {
  GDRIVE_CLIENT_ID,
  GDRIVE_SCOPES,
  GDRIVE_APP_PROPERTY_KEY,
  GDRIVE_APP_PROPERTY_VALUE,
  GDRIVE_AUTOSYNC_FILENAME,
  GDRIVE_AUTOSYNC_DELAY_MS,
  GDRIVE_LOCAL_STORAGE_KEY_LAST_SYNC,
  GDRIVE_LOCAL_STORAGE_KEY_AUTOSYNC,
} from './constants';
import { gzipString, gunzipBlob, isGzipped } from './backup-compress';
import { db } from './db';
import type { Trip, LocationUnion } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
    photos: string[];
  }[];
}

export interface DriveBackupFile {
  id: string;
  name: string;
  size: number;
  modifiedTime: string;
}

// ---------------------------------------------------------------------------
// GIS Script Loader
// ---------------------------------------------------------------------------

let gisLoaded = false;

export async function loadGIScript(): Promise<void> {
  if (gisLoaded || typeof google !== 'undefined' && google.accounts) return;
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => { gisLoaded = true; resolve(); });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Token Management (memory-only)
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;

export function getAccessToken(): string | null {
  return cachedToken;
}

export function setAccessToken(token: string | null): void {
  cachedToken = token;
}

export function isConnected(): boolean {
  return cachedToken !== null;
}

// ---------------------------------------------------------------------------
// OAuth2 — request access token via popup
// ---------------------------------------------------------------------------

export function requestAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!GDRIVE_CLIENT_ID) {
      return reject(new Error('Google Drive client ID not configured. Set VITE_GDRIVE_CLIENT_ID in your .env file.'));
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          return reject(new Error(tokenResponse.error));
        }
        const token = tokenResponse.access_token;
        if (!token) {
          return reject(new Error('No access token received.'));
        }
        cachedToken = token;
        resolve(token);
      },
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function disconnect(): void {
  if (cachedToken) {
    google.accounts.oauth2.revoke(cachedToken, () => {});
  }
  cachedToken = null;
}

// ---------------------------------------------------------------------------
// Serialization — read IndexedDB and build backup payload
// ---------------------------------------------------------------------------

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const trips = await db.trips.toArray();
  const pages = await db.pages.toArray();

  const serializedPages = [];
  for (const page of pages) {
    const base64Photos: string[] = [];
    if (page.photos) {
      for (const blob of page.photos) {
        base64Photos.push(await blobToBase64(blob));
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
      photos: base64Photos,
    });
  }

  return { version: 1, trips, pages: serializedPages };
}

// ---------------------------------------------------------------------------
// Drive API — upload
// ---------------------------------------------------------------------------

export async function uploadBackup(
  compressedBlob: Blob,
  filename: string,
  accessToken: string,
): Promise<{ fileId: string; name: string }> {
  const metadata = {
    name: filename,
    mimeType: 'application/gzip',
    appProperties: {
      [GDRIVE_APP_PROPERTY_KEY]: GDRIVE_APP_PROPERTY_VALUE,
    },
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', compressedBlob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { fileId: data.id, name: filename };
}

// ---------------------------------------------------------------------------
// Drive API — list backups
// ---------------------------------------------------------------------------

export async function listBackups(accessToken: string): Promise<DriveBackupFile[]> {
  const q = `appProperties has { key='${GDRIVE_APP_PROPERTY_KEY}' and value='${GDRIVE_APP_PROPERTY_VALUE}' }`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive list failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return (data.files || []) as DriveBackupFile[];
}

// ---------------------------------------------------------------------------
// Drive API — download
// ---------------------------------------------------------------------------

export async function downloadBackup(
  fileId: string,
  accessToken: string,
): Promise<Blob> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive download failed (${res.status}): ${body}`);
  }

  return await res.blob();
}

// ---------------------------------------------------------------------------
// Drive API — delete
// ---------------------------------------------------------------------------

export async function deleteBackup(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive delete failed (${res.status}): ${body}`);
  }
}

// ---------------------------------------------------------------------------
// High-level: backup to Drive
// ---------------------------------------------------------------------------

export async function performBackup(
  accessToken: string,
  filename: string,
): Promise<{ fileId: string; name: string }> {
  const payload = await buildBackupPayload();
  const json = JSON.stringify(payload);
  const compressed = await gzipString(json);
  return await uploadBackup(compressed, filename, accessToken);
}

// ---------------------------------------------------------------------------
// High-level: restore from Drive
// ---------------------------------------------------------------------------

export async function performRestore(
  fileId: string,
  accessToken: string,
): Promise<void> {
  const blob = await downloadBackup(fileId, accessToken);
  const gzipped = await isGzipped(blob);
  const jsonStr = await (gzipped ? gunzipBlob(blob) : blob.text());
  const payload: BackupPayload = JSON.parse(jsonStr);

  if (payload.version !== 1 || !Array.isArray(payload.trips) || !Array.isArray(payload.pages)) {
    throw new Error('Unsupported or corrupted backup schema.');
  }

  const base64ToBlob = async (base64Url: string): Promise<Blob> => {
    const res = await fetch(base64Url);
    return await res.blob();
  };

  await db.transaction('rw', db.trips, db.pages, async () => {
    await db.trips.clear();
    await db.pages.clear();

    const tripIdMapping = new Map<number, number>();
    for (const trip of payload.trips) {
      const { id: _oldId, ...tripData } = trip;
      const newId = await db.trips.add(tripData) as number;
      if (_oldId !== undefined) tripIdMapping.set(_oldId, newId);
    }

    for (const page of payload.pages) {
      const mappedTripId = tripIdMapping.get(page.tripId);
      if (mappedTripId === undefined) continue;

      const photoBlobs: Blob[] = [];
      if (page.photos) {
        for (const base64 of page.photos) {
          photoBlobs.push(await base64ToBlob(base64));
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
        roadPath: page.roadPath,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Auto-sync
// ---------------------------------------------------------------------------

let autoSyncEnabled = localStorage.getItem(GDRIVE_LOCAL_STORAGE_KEY_AUTOSYNC) === 'true';
let pendingSyncTimeout: ReturnType<typeof setTimeout> | null = null;

export function isAutoSyncEnabled(): boolean {
  return autoSyncEnabled;
}

export function setAutoSyncEnabled(enabled: boolean): void {
  autoSyncEnabled = enabled;
  localStorage.setItem(GDRIVE_LOCAL_STORAGE_KEY_AUTOSYNC, String(enabled));
  if (!enabled && pendingSyncTimeout) {
    clearTimeout(pendingSyncTimeout);
    pendingSyncTimeout = null;
  }
}

export function getLastSyncTime(): string | null {
  return localStorage.getItem(GDRIVE_LOCAL_STORAGE_KEY_LAST_SYNC);
}

export function scheduleAutoSync(): void {
  if (!autoSyncEnabled || !cachedToken) return;
  if (pendingSyncTimeout) clearTimeout(pendingSyncTimeout);
  pendingSyncTimeout = setTimeout(async () => {
    try {
      await performAutoSync();
    } catch (err) {
      console.warn('[GDrive] Auto-sync failed:', err);
    }
  }, GDRIVE_AUTOSYNC_DELAY_MS);
}

async function performAutoSync(): Promise<void> {
  if (!cachedToken) return;

  const payload = await buildBackupPayload();
  const json = JSON.stringify(payload);
  const compressed = await gzipString(json);

  // Check for existing autosync file
  const existing = await findAutosyncFile(cachedToken);

  if (existing) {
    // Overwrite existing file by deleting and re-uploading
    await deleteBackup(existing.id, cachedToken);
  }

  await uploadBackup(compressed, GDRIVE_AUTOSYNC_FILENAME, cachedToken);

  const now = new Date().toISOString();
  localStorage.setItem(GDRIVE_LOCAL_STORAGE_KEY_LAST_SYNC, now);
}

async function findAutosyncFile(accessToken: string): Promise<DriveBackupFile | null> {
  const files = await listBackups(accessToken);
  return files.find(f => f.name === GDRIVE_AUTOSYNC_FILENAME) || null;
}

// ---------------------------------------------------------------------------
// Type declaration for Google Identity Services
// ---------------------------------------------------------------------------

declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string; error?: string }) => void;
      }): {
        requestAccessToken: (options?: { prompt?: string }) => void;
      };
      revoke(token: string, callback: () => void): void;
    };
  };
};
