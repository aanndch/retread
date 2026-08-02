export const Theme = {
  Daylight: 'daylight',
  Nightfall: 'nightfall',
  Monotone: 'monotone',
  Sepia: 'sepia',
  Midnight: 'midnight',
  Slate: 'slate',
  Cyberpunk: 'cyberpunk',
} as const;

export type Theme = typeof Theme[keyof typeof Theme];

const THEME_VALUES = new Set<string>(Object.values(Theme));

const THEME_COLORS: Record<Theme, string> = {
  [Theme.Daylight]: '#f4efe6',
  [Theme.Nightfall]: '#2a2520',
  [Theme.Monotone]: '#e8e8e8',
  [Theme.Sepia]: '#f5e6c8',
  [Theme.Midnight]: '#1a1d23',
  [Theme.Slate]: '#e2dfd8',
  [Theme.Cyberpunk]: '#0a0a0f',
};

function applyThemeColor(theme: Theme) {
  const color = THEME_COLORS[theme];
  // Chrome/Firefox Android ignore setAttribute() on an existing meta tag.
  // Must remove and recreate the element for the change to take effect.
  const existing = document.querySelector('meta[name="theme-color"]');
  if (existing) existing.remove();
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.setAttribute('content', color);
  document.head.appendChild(meta);
}

/**
 * Retrieves the user's explicitly saved theme preference.
 */
export function getSavedTheme(): Theme | null {
  const theme = localStorage.getItem('theme');
  if (theme && THEME_VALUES.has(theme)) return theme as Theme;
  // Migrate legacy values
  if (theme === 'light') return Theme.Daylight;
  if (theme === 'dark') return Theme.Nightfall;
  return null;
}

/**
 * Saves and applies the theme preference.
 * If 'system' is provided, clears the manual override and respects OS preferences.
 */
export function saveTheme(theme: Theme | 'system') {
  if (theme === 'system') {
    localStorage.removeItem('theme');
    document.documentElement.removeAttribute('data-theme');
    applyThemeColor(getActiveTheme());
  } else {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    applyThemeColor(theme);
  }
  // Dispatch a custom event to notify other components of the change
  window.dispatchEvent(new Event('themechange'));
}

/**
 * Initializes the theme on application startup.
 */
export function initTheme() {
  const saved = getSavedTheme();
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    applyThemeColor(saved);
  } else {
    document.documentElement.removeAttribute('data-theme');
    applyThemeColor(getActiveTheme());
  }
}

/**
 * Resolves the currently active theme (either manual override or computed system setting).
 */
export function getActiveTheme(): Theme {
  const saved = getSavedTheme();
  if (saved) return saved;
  
  // Fall back to system preference
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return systemPrefersDark ? Theme.Nightfall : Theme.Daylight;
}
