export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'hs_theme';
export const THEME_CHANGE_EVENT = 'hs:theme-change';

export const THEME_PAGE_BG: Record<ThemeMode, string> = {
  light: '#E4D6C3',
  dark: '#120E0A',
};

export const THEME_TOGGLE_CHROME: Record<
  ThemeMode,
  {
    backgroundColor: string;
    borderColor: string;
    color: string;
  }
> = {
  light: {
    backgroundColor: '#EFE5D6',
    borderColor: '#C2AD93',
    color: '#5C4008',
  },
  dark: {
    backgroundColor: '#1F1710',
    borderColor: '#3D2F20',
    color: '#D8B467',
  },
};

export function getTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const docEl = document.documentElement;
  docEl.setAttribute('data-theme', theme);
  // Ensure legacy class never lingers
  if (docEl.classList.contains('dark')) {
    docEl.classList.remove('dark');
  }
  const metaTheme = document.querySelector<HTMLMetaElement>(
    theme === 'dark'
      ? 'meta[name="theme-color"][media*="dark"]'
      : 'meta[name="theme-color"][media*="light"]'
  );
  if (metaTheme) {
    metaTheme.content = THEME_PAGE_BG[theme];
  }
  try {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme } }));
  } catch {
    // Ignore custom event dispatch errors in restricted environments
  }
}

export function saveTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function getThemePageBg(theme: ThemeMode): string {
  return THEME_PAGE_BG[theme];
}

export function getThemeRimColor(targetTheme: ThemeMode): [number, number, number] {
  // Pure black pigment rim going to dark theme, pure white pigment rim going to light theme
  return targetTheme === 'dark' ? [0, 0, 0] : [1, 1, 1];
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isInkDisabledByQuery(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('gi') === '0';
  } catch {
    return false;
  }
}

export function shouldIgnoreThemeShortcut(e: KeyboardEvent): boolean {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return true;
  if (e.key !== 't' && e.key !== 'T') return true;
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
