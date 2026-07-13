import { test, expect } from './fixtures.js';

// Verifies the embed pages (which load groove_display.js as an ES module and
// self-inject the MIDI/abc2svg libraries) actually render in a browser. These
// pages have no unit coverage, so this guards the increment-2 conversion.

const GROOVE =
  '?TimeSig=4/4&Div=16&Tempo=80&Measures=1' +
  '&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|';

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_/.test(t)) return; // blocked externals (fonts)
    errors.push(t);
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return errors;
}

test('GrooveEmbed.html renders a groove from the URL without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/GrooveEmbed.html' + GROOVE);
  // AddGrooveDisplayToPage builds an SVG once the injected libraries load.
  await page.waitForSelector('svg', { timeout: 15000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('GrooveMultiDisplay.html renders multiple grooves', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/GrooveMultiDisplay.html');
  await page.waitForSelector('svg', { timeout: 15000 });
  // It embeds many grooves; expect more than one rendered.
  const count = await page.locator('svg').count();
  expect(count).toBeGreaterThan(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('grooveDBTest.html renders (GrooveDBFormatPutGrooveOnPage path)', async ({ page }) => {
  // Exercises GrooveDBFormatPutGrooveOnPage, which now uses DOM insertion instead
  // of document.write so it works under deferred ES-module loading.
  const errors = collectErrors(page);
  await page.goto('/grooveDBTest.html');
  await page.waitForSelector('svg', { timeout: 15000 });
  expect(await page.locator('svg').count()).toBeGreaterThan(1);
  expect(errors, errors.join('\n')).toEqual([]);
});
