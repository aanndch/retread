export type Theme = 'daylight' | 'nightfall' | 'monotone' | 'sepia' | 'midnight' | 'slate' | 'cyberpunk';

/**
 * Retrieves the user's explicitly saved theme preference.
 */
export function getSavedTheme(): Theme | null {
  const theme = localStorage.getItem('theme');
  if (
    theme === 'daylight' || theme === 'nightfall' || theme === 'monotone' ||
    theme === 'sepia' || theme === 'midnight' || theme === 'slate' || theme === 'cyberpunk'
  ) return theme;
  // Migrate legacy values
  if (theme === 'light') return 'daylight';
  if (theme === 'dark') return 'nightfall';
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
  } else {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
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
  } else {
    document.documentElement.removeAttribute('data-theme');
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
  return systemPrefersDark ? 'nightfall' : 'daylight';
}
