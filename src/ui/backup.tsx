import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { db } from '../db';
import { Button } from '../components/button';
import { ConfirmModal } from '../components/confirm-modal';
import { Toast, useToast } from '../components/toast';
import { PageHeader } from '../components/page-header';
import { HASH_HOME, GDRIVE_AUTOSYNC_FILENAME } from '../constants';
import type { Trip, LocationUnion } from '../types';
import type { JSX } from 'preact';
import {
  loadGIScript,
  requestAccessToken,
  getAccessToken,
  disconnect,
  isConnected,
  performBackup,
  performRestore,
  listBackups,
  deleteBackup,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  getLastSyncTime,
  scheduleAutoSync,
  type DriveBackupFile,
} from '../gdrive';

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
    photos: string[];
  }[];
}

export function Backup({ onNavigate }: BackupProps) {
  const [working, setWorking] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [pendingRestoreData, setPendingRestoreData] = useState<BackupPayload | null>(null);
  const [showConfirmDisconnect, setShowConfirmDisconnect] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toasts, showToast, removeToast } = useToast();

  // GDrive state
  const [gdriveConnected, setGdriveConnected] = useState(isConnected());
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveFiles, setGdriveFiles] = useState<DriveBackupFile[]>([]);
  const [gdriveLoadingFiles, setGdriveLoadingFiles] = useState(false);
  const [autoSync, setAutoSync] = useState(isAutoSyncEnabled());
  const [lastSync, setLastSync] = useState<string | null>(getLastSyncTime());
  const [gdriveStatus, setGdriveStatus] = useState('');
  const [showFiles, setShowFiles] = useState(false);

  // Load GDrive files when connected
  const refreshGdriveFiles = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    setGdriveLoadingFiles(true);
    try {
      const files = await listBackups(token);
      setGdriveFiles(files);
    } catch (err) {
      console.error('Failed to list GDrive backups:', err);
    } finally {
      setGdriveLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (gdriveConnected) refreshGdriveFiles();
  }, [gdriveConnected, refreshGdriveFiles]);

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

  // ── Local Export ──────────────────────────────────────────────────────────

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
      
      const jsonString = JSON.stringify(payload);
      const jsonBlob = new Blob([jsonString], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(jsonBlob);
      
      const dateTag = new Date().toISOString().split('T')[0];
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `retread-backup-${dateTag}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      
      document.body.removeChild(anchor);
      URL.revokeObjectURL(downloadUrl);
      
      setStatusText('Backup file generated successfully.');
    } catch (err) {
      console.error('Backup export failed:', err);
      showToast('Failed to generate backup file.');
      setStatusText('Export failed.');
    } finally {
      setWorking(false);
    }
  };

  // ── Local Import ──────────────────────────────────────────────────────────

  const handleImport = async (e: JSX.TargetedEvent<HTMLInputElement>) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
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
      
      if (parsedData.version !== 1 || !Array.isArray(parsedData.trips) || !Array.isArray(parsedData.pages)) {
        throw new Error('Unsupported or corrupted backup schema.');
      }
      
      setPendingRestoreData(parsedData);
      setShowConfirmRestore(true);
      setWorking(false);
      setStatusText('');
    } catch (err) {
      console.error('Failed to read backup file:', err);
      showToast(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setStatusText('');
      setWorking(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreData) return;
    
    setShowConfirmRestore(false);
    setWorking(true);
    setStatusText('Restoring database...');
    
    try {
      const parsedData = pendingRestoreData;
      setPendingRestoreData(null);

      await db.transaction('rw', db.trips, db.pages, async () => {
        await db.trips.clear();
        await db.pages.clear();
        
        setStatusText('Restoring trip indexes...');
        
        const tripIdMapping = new Map<number, number>();
        for (const trip of parsedData.trips) {
          const { id: _oldId, ...tripData } = trip;
          const newId = await db.trips.add(tripData) as number;
          if (_oldId !== undefined) {
            tripIdMapping.set(_oldId, newId);
          }
        }
        
        setStatusText('Decoding and restoring day logs (this may take a few moments)...');
        
        for (const page of parsedData.pages) {
          const mappedTripId = tripIdMapping.get(page.tripId);
          if (mappedTripId === undefined) {
            console.warn(`Skipping page on ${page.date} due to missing trip index.`);
            continue;
          }
          
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
      });

      setStatusText('Restore finished successfully.');
      showToast('Logs database successfully restored!', 'success');
      
      if (fileInputRef.current) fileInputRef.current.value = '';
      onNavigate('#/');
    } catch (err: unknown) {
      console.error('Backup import failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      showToast(`Import failed: ${message}`);
      setStatusText('Import failed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setWorking(false);
    }
  };

  // ── Google Drive ──────────────────────────────────────────────────────────

  const handleGDriveConnect = async () => {
    setGdriveConnecting(true);
    try {
      await loadGIScript();
      await requestAccessToken();
      setGdriveConnected(true);
      showToast('Connected to Google Drive.', 'success');
    } catch (err) {
      console.error('GDrive connect failed:', err);
      showToast(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setGdriveConnecting(false);
    }
  };

  const handleGDriveDisconnect = () => {
    disconnect();
    setGdriveConnected(false);
    setGdriveFiles([]);
    setAutoSyncEnabled(false);
    setAutoSync(false);
    setShowConfirmDisconnect(false);
    showToast('Disconnected from Google Drive.');
  };

  const handleGDriveBackup = async () => {
    const token = getAccessToken();
    if (!token) return;

    setWorking(true);
    setGdriveStatus('Compressing...');

    try {
      const dateTag = new Date().toISOString().split('T')[0];
      const filename = `retread-backup-${dateTag}.json.gz`;
      await performBackup(token, filename);
      setGdriveStatus('Done!');
      setLastSync(new Date().toISOString());
      localStorage.setItem('retread-gdrive-last-sync', new Date().toISOString());
      showToast('Backup saved to Google Drive.', 'success');
      await refreshGdriveFiles();
    } catch (err) {
      console.error('GDrive backup failed:', err);
      showToast(`Backup failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setGdriveStatus('');
    } finally {
      setWorking(false);
      setTimeout(() => setGdriveStatus(''), 3000);
    }
  };

  const handleGDriveRestore = async (fileId: string) => {
    const token = getAccessToken();
    if (!token) return;

    setWorking(true);
    setGdriveStatus('Downloading...');

    try {
      await performRestore(fileId, token);
      setGdriveStatus('Done!');
      showToast('Database restored from Google Drive.', 'success');
      onNavigate('#/');
    } catch (err) {
      console.error('GDrive restore failed:', err);
      showToast(`Restore failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setGdriveStatus('');
    } finally {
      setWorking(false);
    }
  };

  const handleGDriveDelete = async (fileId: string) => {
    const token = getAccessToken();
    if (!token) return;

    try {
      await deleteBackup(fileId, token);
      showToast('Backup deleted.', 'success');
      await refreshGdriveFiles();
    } catch (err) {
      console.error('GDrive delete failed:', err);
      showToast(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAutoSyncToggle = (e: JSX.TargetedEvent<HTMLInputElement>) => {
    const checked = (e.target as HTMLInputElement).checked;
    setAutoSync(checked);
    setAutoSyncEnabled(checked);
    if (checked) scheduleAutoSync();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div class="backup-container">
      <PageHeader 
        title="Backup & Restore" 
        onBack={() => onNavigate(HASH_HOME)} 
        classType="backup" 
        disabled={working}
      />

      <main class="backup-body">

        {statusText && (
          <div class="backup-status">
            <span class="status-indicator">✦</span>
            <p>{statusText}</p>
          </div>
        )}

        {/* ── Local Backup ───────────────────────────────────────────────── */}
        <section class="backup-card">
          <div class="card-head">
            <h4>Local Backup</h4>
          </div>

          <p class="micro-help">Saves a .json file on this device. Use it to move your logs to another device.</p>

          <div class="local-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={handleExport}
              disabled={working}
            >
              {working ? 'Exporting...' : 'Export'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={working}
            >
              {working ? 'Restoring...' : 'Import'}
            </Button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept=".json,.json.gz"
            onChange={handleImport}
            id="backup-import"
            class="file-hidden-input"
            disabled={working}
          />
        </section>

        {/* ── Google Drive ───────────────────────────────────────────────── */}
        <section class="backup-card gdrive-card">
          <div class="card-head">
            <h4>Google Drive</h4>
            {gdriveConnected && (
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => setShowConfirmDisconnect(true)}
                disabled={working}
                class="connected-badge-btn"
              >
                <span class="connected-badge-dot" />
                Connected
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </Button>
            )}
          </div>

          {!gdriveConnected ? (
            <>
              <p class="micro-help">Keep backups safe in the cloud, and restore them on any device.</p>
              <Button
                variant="primary"
                size="sm"
                onClick={handleGDriveConnect}
                disabled={gdriveConnecting || working}
                class="gdrive-hero-btn"
              >
                {gdriveConnecting ? 'Connecting...' : 'Connect Google Account'}
              </Button>
            </>
          ) : (
            <div class="gdrive-connected">
              <div class="gdrive-autosync-row">
                <label class="gdrive-autosync-toggle">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={handleAutoSyncToggle}
                    disabled={working}
                  />
                  <span>Auto-sync after each save</span>
                </label>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handleGDriveBackup}
                disabled={working}
                class="gdrive-hero-btn"
              >
                {working && gdriveStatus ? gdriveStatus : 'Backup Now'}
              </Button>

              {lastSync && (
                <p class="gdrive-last-sync">Last backup: {formatDate(lastSync)}</p>
              )}

              <div class="gdrive-files">
                <button
                  type="button"
                  class="gdrive-files-toggle"
                  onClick={() => setShowFiles((v) => !v)}
                  aria-expanded={showFiles}
                >
                  {showFiles ? 'Hide' : 'Show'} backups ({gdriveFiles.length})
                </button>

                {showFiles && (
                  gdriveLoadingFiles ? (
                    <p class="gdrive-files-loading">Loading...</p>
                  ) : gdriveFiles.length === 0 ? (
                    <p class="gdrive-files-empty">Your first backup hasn't been saved yet.</p>
                  ) : (
                    <ul class="gdrive-file-list">
                      {gdriveFiles.map((file) => (
                        <li key={file.id} class="gdrive-file-item">
                          <div class="gdrive-file-info">
                            <span class="gdrive-file-name">{file.name}</span>
                            <span class="gdrive-file-meta">
                              {formatFileSize(file.size)} · {formatDate(file.modifiedTime)}
                            </span>
                          </div>
                          <div class="gdrive-file-actions">
                            {file.name !== GDRIVE_AUTOSYNC_FILENAME && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleGDriveRestore(file.id)}
                                disabled={working}
                              >
                                Restore
                              </Button>
                            )}
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleGDriveDelete(file.id)}
                              disabled={working}
                              class="btn-danger"
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {showConfirmRestore && (
        <ConfirmModal
          title="Restore Backup?"
          message="WARNING: Restoring this backup will overwrite all current logs and database records on this device. Do you wish to proceed?"
          confirmLabel="Restore"
          onConfirm={handleConfirmRestore}
          onCancel={() => {
            setShowConfirmRestore(false);
            setPendingRestoreData(null);
          }}
        />
      )}

      {showConfirmDisconnect && (
        <ConfirmModal
          title="Disconnect Google Drive?"
          message="You'll be signed out and auto-sync will stop. Your existing backups will remain in Google Drive."
          confirmLabel="Disconnect"
          onConfirm={handleGDriveDisconnect}
          onCancel={() => setShowConfirmDisconnect(false)}
        />
      )}

      <div class="toast-container">
        {toasts.map(t => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </div>
  );
}
