import { test as base, expect } from '@playwright/test';

// Hermetic test fixture: block every request that isn't the local dev server
// (or an inline data:/blob: URL). The app references external resources — Google
// Fonts, and a hardcoded Google Drive fallback host — which are irrelevant to
// what we're testing and, in a sandboxed/offline environment, hang the page's
// `load` event long enough to time out navigation. Aborting them makes page
// loads fast, deterministic, and independent of network conditions. The app
// degrades gracefully (falls back to system fonts); the soundfont itself is
// served locally, so playback still works.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (
        url.startsWith('http://localhost:8000') ||
        url.startsWith('http://127.0.0.1:8000') ||
        url.startsWith('data:') ||
        url.startsWith('blob:')
      ) {
        return route.continue();
      }
      return route.abort();
    });
    await use(page);
  },
});

export { expect };
