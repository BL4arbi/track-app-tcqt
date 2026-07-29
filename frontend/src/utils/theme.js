const STORAGE_KEY = 'theme';

function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Call once before mount so the correct theme is set from the first paint —
// either the user's saved choice, or the OS preference if they never chose.
export function initTheme() {
  const theme = getStoredTheme() || (systemPrefersDark() ? 'dark' : 'light');
  applyTheme(theme);
  return theme;
}

export function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // best-effort — the choice just won't persist across restarts
  }
}
