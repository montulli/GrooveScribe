// Global test setup, run once per test file before any tests (see
// vitest.config.js `setupFiles`).
//
// The jsdom environment already provides `window`, `document`, `navigator`,
// `localStorage`, etc. Here we add the few browser APIs the Groove Scribe
// sources touch that jsdom does not implement, so that unmodified production
// code can be loaded and exercised without throwing at import time.

import { vi, beforeEach } from 'vitest';

// jsdom does not implement matchMedia; some display code queries it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom does not implement scrollTo.
if (!window.scrollTo) {
  window.scrollTo = vi.fn();
}

// Keep every test isolated from any DOM one of its predecessors may have built.
beforeEach(() => {
  document.body.innerHTML = '';
});
