import { useState } from 'preact/hooks';
import { PageHeader } from '../components/page-header';
import { Button } from '../components/button';
import { FieldCard } from '../components/field-card';
import { Dropdown } from '../components/dropdown';
import { ToastHost, useToast } from '../components/toast';
import { getSavedTheme, saveTheme, Theme } from '../theme';
import { seedDemoRide, seedPhantomDemoRide } from './seed-demo';

interface SettingsProps {
  onNavigate: (route: string) => void;
  onNavigateBack: (logicalParent: string | null) => void;
}

// Settings as a real routed page (#/settings): the standard PageHeader shell
// (back is context-aware via onNavigateBack) over the former modal's content.
// No backdrop, no scroll lock — it's a page like backup/todo/photos.
export function Settings({ onNavigate, onNavigateBack }: SettingsProps) {
  const [themeMode, setThemeMode] = useState<'system' | Theme>(() => getSavedTheme() ?? 'system');
  const [seedingDemo, setSeedingDemo] = useState(false);
  const { toasts, showToast, removeToast } = useToast();

  const handleThemeChange = (mode: string) => {
    const theme = mode as 'system' | Theme;
    setThemeMode(theme);
    saveTheme(theme);
  };

  const seedRide = async (seedFn: () => Promise<number>, successMsg: string) => {
    if (seedingDemo) return;
    setSeedingDemo(true);
    try {
      await seedFn();
      showToast(successMsg, 'success');
    } catch (err) {
      console.error('Failed to seed demo data:', err);
      showToast('Error seeding demo data.');
    } finally {
      setSeedingDemo(false);
    }
  };

  return (
    <div class="settings-container">
      <PageHeader onBack={() => onNavigateBack('#/')} />

      <main class="settings-body">
        <h2 class="page-heading">Settings</h2>

        {/* Theme Toggle */}
        <FieldCard label="Color Theme">
          <Dropdown
            value={themeMode}
            onChange={handleThemeChange}
            options={[
              { value: 'system', label: 'System Default' },
              { value: Theme.Daylight, label: 'Daylight (Cream Paper)' },
              { value: Theme.Nightfall, label: 'Nightfall (Dark Ink)' },
              { value: Theme.Sepia, label: 'Sepia (Aged Parchment)' },
              { value: Theme.Midnight, label: 'Midnight (Blue Night)' },
              { value: Theme.Slate, label: 'Slate (Warm Gray)' },
              { value: Theme.Monotone, label: 'Monotone (Grayscale)' },
              { value: Theme.Cyberpunk, label: 'Cyberpunk (Neon Noir)' },
            ]}
          />
        </FieldCard>

        {/* Backup & Restore */}
        <FieldCard label="Data Management">
          <div class="settings-buttons">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate('#/backup')}
            >
              Backup & Restore
            </Button>
          </div>
        </FieldCard>

        {/* Seed Demo Data */}
        <FieldCard label="Demo Content">
          <div class="settings-buttons">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => seedRide(seedDemoRide, 'Demo ride added.')}
              disabled={seedingDemo}
            >
              {seedingDemo ? 'Seeding demo ride…' : 'Seed Western Ghats Demo Ride'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => seedRide(seedPhantomDemoRide, 'Phantom demo ride added.')}
              disabled={seedingDemo}
            >
              {seedingDemo ? 'Seeding demo ride…' : 'Seed Spiti Phantom Demo Ride'}
            </Button>
          </div>
        </FieldCard>

        {/* What's New (changelog + roadmap) */}
        <FieldCard label="What's New">
          <div class="settings-buttons">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate('#/todo')}
            >
              View Build Log
            </Button>
          </div>
        </FieldCard>
      </main>

      <ToastHost toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
