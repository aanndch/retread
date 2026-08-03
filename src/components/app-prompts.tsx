import { useState, useEffect } from 'preact/hooks';
import { InfoModal } from '../components/info-modal';
import { HASH_BACKUP } from '../constants';

const LS_KEY_PWA_DISMISSED = 'retread-pwa-prompt-dismissed';
const LS_KEY_IOS_BACKUP_LAST = 'retread-ios-backup-reminder-last';
const IOS_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Platform helpers ─────────────────────────────────────────────────────────

function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true;
}

// ─── PWA Install Prompt ───────────────────────────────────────────────────────

interface PWAInstallPromptProps {
  onClose: () => void;
}

export function PWAInstallPrompt({ onClose }: PWAInstallPromptProps) {
  const dismiss = () => {
    localStorage.setItem(LS_KEY_PWA_DISMISSED, 'true');
    onClose();
  };

  const ios = isIOS();

  return (
    <InfoModal title="Add to Home Screen" onClose={dismiss}>
      <div class="info-modal-section">
        <p class="info-modal-text">
          For the best experience, install Retread on your home screen. It'll launch fullscreen, work offline, and feel like a native app.
        </p>
      </div>

      {ios ? (
        <div class="info-modal-steps">
          <p class="info-modal-step-title">On Safari:</p>
          <ol class="info-modal-ol">
            <li>Tap the <strong>Share</strong> button <span class="info-modal-icon-hint">(the square with an arrow)</span></li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong></li>
          </ol>
        </div>
      ) : (
        <div class="info-modal-steps">
          <p class="info-modal-step-title">How to install:</p>
          <ul class="info-modal-ul">
            <li>Look for the <strong>"Install"</strong> or <strong>"Add to Home Screen"</strong> prompt in your browser's menu or address bar.</li>
            <li>On Chrome, tap <strong>⋮ &gt; Install app</strong> or <strong>Add to Home screen</strong>.</li>
          </ul>
        </div>
      )}
    </InfoModal>
  );
}

// ─── iOS Backup Reminder ──────────────────────────────────────────────────────

interface IOSBackupReminderProps {
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export function IOSBackupReminder({ onClose, onNavigate }: IOSBackupReminderProps) {
  const dismiss = () => {
    localStorage.setItem(LS_KEY_IOS_BACKUP_LAST, Date.now().toString());
    onClose();
  };

  const goToBackup = () => {
    dismiss();
    onNavigate(HASH_BACKUP);
  };

  return (
    <InfoModal
      title="Back Up Your Data"
      actionLabel="Open Backup"
      onAction={goToBackup}
      onClose={dismiss}
    >
      <div class="info-modal-section">
        <p class="info-modal-text">
          Retread stores everything — your rides, photos, and routes — locally on this device using your browser's storage.
        </p>
      </div>

      <div class="info-modal-callout">
        <span class="info-modal-callout-icon">⚠</span>
        <div>
          <p class="info-modal-text" style={{ fontWeight: 600 }}>
            iOS can delete local website data without warning.
          </p>
          <p class="info-modal-text-sm">
            Safari may clear IndexedDB storage if the app hasn't been used for a few weeks, or during low-storage cleanup — even for apps added to your home screen.
          </p>
        </div>
      </div>

      <div class="info-modal-section">
        <p class="info-modal-text">
          To protect your memories, we strongly recommend exporting a backup file regularly. It takes a few seconds and saves everything.
        </p>
      </div>
    </InfoModal>
  );
}

// ─── Hook: which prompt to show ───────────────────────────────────────────────

export type AppPrompt = 'pwa-install' | 'ios-backup' | null;

export function useAppPrompts(): AppPrompt {
  const [prompt, setPrompt] = useState<AppPrompt>(null);

  useEffect(() => {
    // Don't show prompts during first-run setup
    if (localStorage.getItem('retread-setup-complete') !== 'true') return;

    // 1. PWA install prompt — show once if not installed and not previously dismissed
    if (!isStandalone() && localStorage.getItem(LS_KEY_PWA_DISMISSED) !== 'true') {
      setPrompt('pwa-install');
      return;
    }

    // 2. iOS backup reminder — show periodically for iOS users
    if (isIOS()) {
      const lastShown = parseInt(localStorage.getItem(LS_KEY_IOS_BACKUP_LAST) || '0', 10);
      if (Date.now() - lastShown > IOS_BACKUP_INTERVAL_MS) {
        setPrompt('ios-backup');
        return;
      }
    }

    setPrompt(null);
  }, []);

  return prompt;
}
