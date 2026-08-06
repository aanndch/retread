import {
  GDRIVE_CLIENT_ID,
  GDRIVE_SCOPES,
  GDRIVE_APP_PROPERTY_KEY,
  GDRIVE_APP_PROPERTY_VALUE,
  GDRIVE_AUTOSYNC_FILENAME,
  GDRIVE_AUTOSYNC_DELAY_MS,
  GDRIVE_LOCAL_STORAGE_KEY_LAST_SYNC,
  GDRIVE_LOCAL_STORAGE_KEY_AUTOSYNC,
  HASH_BACKUP,
} from './constants';
import { gzipString, gunzipBlob, isGzipped } from './backup-compress';
import { createThumbnail } from './images';
import { db } from './db';
import type { Ride, LocationUnion } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// v1: rides + legs with per-leg title/time, and the ride cover snapshot
// (Ride.coverBlob, base64-serialized). Pre-release; the format is reset to 1
// whenever the schema changes since there's no production data to migrate.
export interface BackupPayload {
  version: 1;
  rides: (Omit<Ride, 'coverBlob'> & { coverBlob: string | null })[];
  legs: {
    rideId: number;
    title?: string;
    date: string;
    time?: string;
    note: string;
    km: number | null;
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
// Token Management (session-scoped)
// ---------------------------------------------------------------------------

let cachedToken: string | null = null;

// The token lives in sessionStorage too so the OAuth return's history collapse
// (which reloads the page back to the pre-auth entry) doesn't lose the
// connection. sessionStorage is cleared when the tab closes, so this is still
// transient — no token ever persists across sessions.
const OAUTH_TOKEN_KEY = 'retread-gdrive-token';

// Restore a token left by an earlier OAuth return in this tab.
const storedToken = sessionStorage.getItem(OAUTH_TOKEN_KEY);
if (storedToken) cachedToken = storedToken;

export function getAccessToken(): string | null {
  return cachedToken;
}

export function setAccessToken(token: string | null): void {
  cachedToken = token;
  if (token) sessionStorage.setItem(OAUTH_TOKEN_KEY, token);
  else sessionStorage.removeItem(OAUTH_TOKEN_KEY);
}

// Re-read the persisted token after a bfcache restore. The restored page keeps
// its frozen JS heap (stale cachedToken), but sessionStorage is shared with the
// OAuth-return document, so the freshly stored token is still readable here.
export function syncTokenFromStorage(): string | null {
  const stored = sessionStorage.getItem(OAUTH_TOKEN_KEY);
  cachedToken = stored;
  return stored;
}

export function isConnected(): boolean {
  return cachedToken !== null;
}

// ---------------------------------------------------------------------------
// OAuth2 — manual implicit-grant redirect flow
// ---------------------------------------------------------------------------
//
// GIS's popup flow (initTokenClient) relays results through
// accounts.google.com/gsi/transform via window.opener.postMessage(). In an
// installed standalone PWA that opener link is severed, the relay throws, and
// the page dies. So we drive the plain oauth2/v2/auth endpoint ourselves with a
// full-page redirect: the token comes back in the URL fragment
// (#access_token=...), and handleOAuthRedirect() parses it before the hash
// router reads it.

const OAUTH_STATE_KEY = 'retread-gdrive-oauth-state';
const OAUTH_RESULT_KEY = 'retread-gdrive-oauth-result';
// Browser history.length at the moment we navigate away to Google. On the way
// back, handleOAuthRedirect() walks back past the Google pages to this entry
// so Android back never re-traverses the OAuth flow.
const OAUTH_HISTORY_BASELINE_KEY = 'retread-gdrive-oauth-history-baseline';

function oauthRedirectUri(): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  // Google's validator rejects redirect URIs ending in '/'. Register it without
  // the slash and send the same string; GitHub Pages' /retread -> /retread/
  // 301 keeps the token fragment intact.
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

// Begins the OAuth dance and navigates the whole page to Google. The returned
// promise only settles if the client ID is missing or navigation is blocked —
// on success the page unloads and the token is picked up on the way back by
// handleOAuthRedirect().
export function requestAccessToken(): Promise<string> {
  return new Promise((_resolve, reject) => {
    if (!GDRIVE_CLIENT_ID) {
      return reject(new Error('Google Drive client ID not configured.'));
    }

    const state =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: GDRIVE_CLIENT_ID,
      redirect_uri: oauthRedirectUri(),
      response_type: 'token',
      scope: GDRIVE_SCOPES,
      state,
      prompt: 'select_account',
    });

    try {
      // Record where we are before leaving, so the return can collapse the
      // Google pages out of the back stack (see handleOAuthRedirect).
      sessionStorage.setItem(OAUTH_HISTORY_BASELINE_KEY, String(window.history.length));
      window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    } catch (err) {
      reject(new Error(describeOAuthError(err)));
    }
  });
}

// Called from main.tsx before the app renders (and on every hashchange, since a
// return from Google can land on an already-open SW-controlled page as a
// same-document fragment change). Detects an OAuth return in the URL fragment,
// verifies the CSRF state, stores the token, cleans the fragment off the URL,
// and lands on the backup page. Returns true when it consumed an OAuth
// redirect.
export function handleOAuthRedirect(): boolean {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return false;

  const params = new URLSearchParams(hash.slice(1));
  const error = params.get('error');
  const token = params.get('access_token');
  if (!error && !token) return false;

  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  const state = params.get('state');

  if (error) {
    setOAuthResult(false, describeOAuthError(error));
  } else if (!expectedState || state !== expectedState) {
    setOAuthResult(false, 'Authorization expired — try connecting again.');
  } else {
    setAccessToken(token);
    setOAuthResult(true);
    // The Backup view may already be mounted (same-document return), so notify
    // it directly in addition to the sessionStorage marker consumed on mount.
    window.dispatchEvent(new Event('retread-gdrive-connected'));
  }

  history.replaceState(null, '', `${window.location.pathname}${window.location.search}${HASH_BACKUP}`);

  // Collapse the Google pages out of the back stack so Android back from the
  // backup page goes to the app's previous page instead of re-walking the whole
  // OAuth flow. depth is how many history entries were added since we recorded
  // the baseline in requestAccessToken(); landing on the pre-OAuth entry reloads
  // the app there, where consumeOAuthResult() surfaces the outcome and the token
  // (persisted in sessionStorage) keeps the connection alive.
  const baselineRaw = sessionStorage.getItem(OAUTH_HISTORY_BASELINE_KEY);
  sessionStorage.removeItem(OAUTH_HISTORY_BASELINE_KEY);
  if (baselineRaw !== null) {
    const baseline = parseInt(baselineRaw, 10);
    const depth = window.history.length - baseline;
    if (depth > 0) {
      window.history.go(-depth);
    }
  }
  return true;
}

type OAuthResult = { ok: true } | { ok: false; error: string };

function setOAuthResult(ok: boolean, error?: string): void {
  const result: OAuthResult = ok
    ? { ok: true }
    : { ok: false, error: error || 'Authorization failed.' };
  sessionStorage.setItem(OAUTH_RESULT_KEY, JSON.stringify(result));
}

// backup.tsx calls this once on mount to surface the outcome of a redirect.
export function consumeOAuthResult(): OAuthResult | null {
  const raw = sessionStorage.getItem(OAUTH_RESULT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(OAUTH_RESULT_KEY);
  try {
    return JSON.parse(raw) as OAuthResult;
  } catch {
    return null;
  }
}

function describeOAuthError(raw: unknown): string {
  const message = raw instanceof Error ? raw.message : String(raw ?? '');
  const lowered = message.toLowerCase();
  if (lowered.includes('invalid_client') || lowered.includes('origin') || lowered.includes('mismatch') || lowered.includes('redirect_uri')) {
    return "Google rejected this client. Check that the client ID is valid and this site's redirect URI is listed under Authorized redirect URIs in Google Cloud.";
  }
  if (lowered.includes('access_denied')) {
    return 'Authorization cancelled.';
  }
  return message || 'Authorization failed.';
}

export function disconnect(): void {
  if (cachedToken) {
    try {
      fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(cachedToken)}`, {
        method: 'POST',
      }).catch(() => {});
    } catch {
      // best-effort — the token is dropped regardless
    }
  }
  cachedToken = null;
  sessionStorage.removeItem(OAUTH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Serialization — read IndexedDB and build backup payload
// ---------------------------------------------------------------------------

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function base64ToBlob(base64Url: string): Promise<Blob> {
  const res = await fetch(base64Url);
  return await res.blob();
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const rides = await db.rides.toArray();
  const legs = await db.legs.toArray();

  const serializedRides: BackupPayload['rides'] = [];
  for (const ride of rides) {
    const { coverBlob, ...rest } = ride;
    serializedRides.push({
      ...rest,
      coverBlob: coverBlob ? await blobToBase64(coverBlob) : null,
    });
  }

  const serializedLegs = [];
  for (const leg of legs) {
    const base64Photos: string[] = [];
    if (leg.photos) {
      for (const blob of leg.photos) {
        base64Photos.push(await blobToBase64(blob));
      }
    }
    serializedLegs.push({
      rideId: leg.rideId,
      title: leg.title || '',
      date: leg.date,
      time: leg.time || '',
      note: leg.note,
      km: leg.km ?? null,
      location: leg.location ?? null,
      roadPath: leg.roadPath ?? null,
      photos: base64Photos,
    });
  }

  return { version: 1, rides: serializedRides, legs: serializedLegs };
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

  if (payload.version !== 1 || !Array.isArray(payload.rides) || !Array.isArray(payload.legs)) {
    throw new Error('Unsupported or corrupted backup schema.');
  }

  // Prepare every record BEFORE the transaction: Dexie cannot track the
  // non-Dexie awaits inside a transaction (fetch/blob/thumbnail), so doing
  // them there would commit it too early and throw "transaction committed too
  // early" — with the rides already written, making the restore appear to
  // succeed anyway. Pre-compute everything, then run a pure-Dexie transaction.
  const ridesToAdd: Ride[] = [];
  for (const ride of payload.rides) {
    const { id: _oldId, coverBlob, ...rideData } = ride;
    ridesToAdd.push({
      ...rideData,
      coverBlob: coverBlob ? await base64ToBlob(coverBlob) : null,
    });
  }

  const legsToAdd: {
    leg: BackupPayload['legs'][number];
    photoBlobs: Blob[];
    photoThumbs: Blob[];
  }[] = [];
  for (const leg of payload.legs) {
    const photoBlobs: Blob[] = [];
    const photoThumbs: Blob[] = [];
    if (leg.photos) {
      for (const base64 of leg.photos) {
        const blob = await base64ToBlob(base64);
        photoBlobs.push(blob);
        try {
          photoThumbs.push(await createThumbnail(blob));
        } catch {
          photoThumbs.push(blob); // keep arrays aligned even if thumb fails
        }
      }
    }
    legsToAdd.push({ leg, photoBlobs, photoThumbs });
  }

  await db.transaction('rw', db.rides, db.legs, async () => {
    await db.rides.clear();
    await db.legs.clear();

    const rideIdMapping = new Map<number, number>();
    for (let i = 0; i < ridesToAdd.length; i++) {
      const newId = await db.rides.add(ridesToAdd[i]) as number;
      const _oldId = payload.rides[i].id;
      if (_oldId !== undefined) rideIdMapping.set(_oldId, newId);
    }

    for (const { leg, photoBlobs, photoThumbs } of legsToAdd) {
      const mappedRideId = rideIdMapping.get(leg.rideId);
      if (mappedRideId === undefined) continue;

      await db.legs.add({
        rideId: mappedRideId,
        title: leg.title || '',
        date: leg.date,
        time: leg.time || '',
        note: leg.note,
        photos: photoBlobs,
        photoThumbs,
        km: leg.km,
        location: leg.location,
        roadPath: leg.roadPath,
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
