import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, beforeEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetPrefs } from '../ui/prefs.js';

expect.extend(matchers);

// Node's own experimental localStorage can shadow jsdom's; use a small in-memory one.
class MemoryStorage {
  #map = new Map();
  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }
  setItem(key, value) {
    this.#map.set(key, String(value));
  }
  removeItem(key) {
    this.#map.delete(key);
  }
  clear() {
    this.#map.clear();
  }
  key(index) {
    return [...this.#map.keys()][index] ?? null;
  }
  get length() {
    return this.#map.size;
  }
}
Object.defineProperty(window, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

// jsdom has no matchMedia. Report "reduce motion" so count-ups show final numbers at once.
beforeEach(() => {
  window.matchMedia = (query) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
  resetPrefs();
  delete document.documentElement.dataset.theme;
});
