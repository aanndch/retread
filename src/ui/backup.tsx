import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import { db } from '../db';
import { createThumbnail } from '../images';
import { Button } from '../components/button';
import { ConfirmModal } from '../components/confirm-modal';
import { Toast, useToast } from '../components/toast';
import { PageHeader } from '../components/page-header';
import { HASH_HOME, GDRIVE_AUTOSYNC_FILENAME } from '../constants';
import type { Ride, LocationUnion } from '../types';
import type { JSX } from 'preact';
import {
  requestAccessToken,
  getAccessToken,
  disconnect,
  isConnected,
  consumeOAuthResult,
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
  onNavigateBack: (logicalParent: string | null) => void;
}

interface BackupPayload {
  version: 2 | 3;
  rides: Ride[];
  legs: {
    rideId: number;
    title?: string;
    date: string;
    time?: string;
    note: string;
    km: number | null;
    odo: number | null;
    location: LocationUnion | null;
    roadPath: { lat: number; lng: number }[] | null;
    photos: string[];
  }[];
}

export function Backup({ onNavigate, onNavigateBack }: BackupProps) {
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

  // Surface the outcome of a Google Drive OAuth redirect. On a full page load
  // the result is stashed in sessionStorage (consumeOAuthResult); on a
  // same-document return the Backup view is already mounted, so it listens for
  // the event gdrive.ts dispatches instead.
  useEffect(() => {
    const onConnected = () => {
      setGdriveConnected(true);
      showToast('Connected to Google Drive.', 'success');
    };
    const result = consumeOAuthResult();
    if (result) {
      if (result.ok) onConnected();
      else showToast(`Connection failed: ${result.error}`);
    }
    window.addEventListener('retread-gdrive-connected', onConnected);
    return () => window.removeEventListener('retread-gdrive-connected', onConnected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const rides = await db.rides.toArray();
      const legs = await db.legs.toArray();
      
      setStatusText(`Serializing database logs (${rides.length} rides, ${legs.length} legs)...`);
      
      const serializedLegs = [];
      for (const leg of legs) {
        setStatusText(`Encoding photos for leg on ${leg.date}...`);
        
        const base64Photos = [];
        if (leg.photos) {
          for (const blob of leg.photos) {
            const base64 = await blobToBase64(blob);
            base64Photos.push(base64);
          }
        }
        
        serializedLegs.push({
          rideId: leg.rideId,
          title: leg.title || '',
          date: leg.date,
          time: leg.time || '',
          note: leg.note,
          km: leg.km ?? null,
          odo: leg.odo ?? null,
          location: leg.location ?? null,
          roadPath: leg.roadPath ?? null,
          photos: base64Photos
        });
      }
      
      const payload: BackupPayload = {
        version: 2,
        rides,
        legs: serializedLegs
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
      
      if ((parsedData.version !== 2 && parsedData.version !== 3) || !Array.isArray(parsedData.rides) || !Array.isArray(parsedData.legs)) {
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

      await db.transaction('rw', db.rides, db.legs, async () => {
        await db.rides.clear();
        await db.legs.clear();
        
        setStatusText('Restoring ride indexes...');
        
        const rideIdMapping = new Map<number, number>();
        for (const ride of parsedData.rides) {
          const { id: _oldId, ...rideData } = ride;
          const newId = await db.rides.add(rideData) as number;
          if (_oldId !== undefined) {
            rideIdMapping.set(_oldId, newId);
          }
        }
        
        setStatusText('Decoding and restoring ride data (this may take a few moments)...');
        
        for (const leg of parsedData.legs) {
          const mappedRideId = rideIdMapping.get(leg.rideId);
          if (mappedRideId === undefined) {
            console.warn(`Skipping leg on ${leg.date} due to missing ride index.`);
            continue;
          }
          
          const photoBlobs = [];
          const photoThumbs = [];
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

          await db.legs.add({
            rideId: mappedRideId,
            title: leg.title || '',
            date: leg.date,
            time: leg.time || '',
            note: leg.note,
            photos: photoBlobs,
            photoThumbs,
            km: leg.km,
            odo: leg.odo,
            location: leg.location,
            roadPath: leg.roadPath
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
      // Full-page redirect to Google — on success the page unloads and we
      // land back here via consumeOAuthResult(); the finally below only runs
      // if navigation was blocked (e.g. missing client ID).
      await requestAccessToken();
      setGdriveConnecting(false);
    } catch (err) {
      console.error('GDrive connect failed:', err);
      showToast(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      <PageHeader onBack={() => onNavigateBack(HASH_HOME)} disabled={working} />

      <main class="backup-body">
        <h2 class="page-heading">Backup & Restore</h2>

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
