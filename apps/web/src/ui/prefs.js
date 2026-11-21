import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Small per-device preferences. Storage can be blocked (private mode), so every access is guarded. */
const KEY = 'lifeos.prefs';
const defaults = {
  theme: 'system', // 'system' | 'light' | 'dark'
  lumi: true,
  motion: true,
  sidebarCollapsed: false,
  avatar: null, // 0..7 colour pair, used when the profile has none
};

function read() {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return {
      ...defaults,
      ...(value && typeof value === 'object' ? value : {}),
    };
  } catch {
    return { ...defaults };
  }
}
let current = typeof window === 'undefined' ? { ...defaults } : read();
const listeners = new Set();

export function setPref(key, value) {
  current = { ...current, [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* Storage blocked: keep the choice for this visit only. */
  }
  listeners.forEach((listener) => listener());
}
/** Test helper: forget everything and read storage again. */
export function resetPrefs() {
  current = read();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, () => current);
  return [prefs, setPref];
}

function systemDark() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}
export function systemReducedMotion() {
  try {
    return (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    );
  } catch {
    return false;
  }
}

/** Applies the chosen theme to <html data-theme> and returns the resolved one. */
export function useTheme() {
  const [prefs] = usePrefs();
  const [dark, setDark] = useState(systemDark);
  useEffect(() => {
    let query;
    try {
      query = window.matchMedia?.('(prefers-color-scheme: dark)');
    } catch {
      query = null;
    }
    if (!query?.addEventListener) return undefined;
    const changed = () => setDark(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  const resolved =
    prefs.theme === 'system' ? (dark ? 'dark' : 'light') : prefs.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.motion = prefs.motion ? 'on' : 'off';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0B1220' : '#F5F7FB');
  }, [resolved, prefs.motion]);
  return resolved;
}

/** True when animation should run: the user's setting and the OS setting both allow it. */
export function useMotion() {
  const [prefs] = usePrefs();
  const [reduced, setReduced] = useState(systemReducedMotion);
  useEffect(() => {
    let query;
    try {
      query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    } catch {
      query = null;
    }
    if (!query?.addEventListener) return undefined;
    const changed = () => setReduced(query.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, []);
  return prefs.motion && !reduced;
}

/** Cycles system → light → dark. */
const nextTheme = { system: 'light', light: 'dark', dark: 'system' };
export function useThemeToggle() {
  const [prefs, set] = usePrefs();
  const cycle = useCallback(
    () => set('theme', nextTheme[prefs.theme] ?? 'system'),
    [prefs.theme, set],
  );
  return [prefs.theme, cycle];
}
