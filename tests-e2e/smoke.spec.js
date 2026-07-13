import { test, expect } from './fixtures.js';
import { grooveUrl } from './corpus.js';
import { loadGroove } from './helpers.js';

// Smoke layer: catch gross regressions cheaply — pages that throw or log errors
// on load, missing core UI, and CSS/layout drift (screenshots).

// A representative spread of grooves (time signatures, divisions, triplets,
// swing, multi-measure, metronome) for the error guard.
const SAMPLE = [
  '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|',
  '?TimeSig=4/4&Div=12&Tempo=90&Measures=1&H=|rrrrrrrrrrrr|&S=|---O----O---|&K=|o--o--o--o--|',
  '?TimeSig=6/8&Div=8&Tempo=90&Measures=1&H=|xxxxxx|&S=|--O--O|&K=|o--o--|',
  '?TimeSig=5/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxxxxxx|&S=|----O-------O-------|&K=|o-------o-------o---|',
  '?TimeSig=4/4&Div=16&Tempo=90&Swing=62&Measures=2&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|&S=|----O-------O---|----O-------O---|&K=|o-------o-------|o-------o-------|',
  '?TimeSig=4/4&Div=48&Tempo=80&Measures=1&MetronomeFreq=4&H=|x---x---x---x---x---x---x---x---x---x---x---x---|&S=|------------O-----------------------O-----------|&K=|o-----------------------o-----------------------|',
];

test.describe('error guard: pages load without console errors or exceptions', () => {
  for (const [i, query] of SAMPLE.entries()) {
    test(`sample groove #${i + 1} loads cleanly`, async ({ page }) => {
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // Ignore network/resource-load failures — these come from the hermetic
        // fixture blocking external requests (fonts, etc.), not from app code.
        if (/Failed to load resource|net::ERR_/.test(text)) return;
        errors.push(`console.error: ${text}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

      await loadGroove(page, grooveUrl(query));
      // Give any deferred load-time work (MIDI init, etc.) a moment to surface errors.
      await page.waitForTimeout(300);

      expect(errors, `unexpected browser errors:\n${errors.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('core UI', () => {
  test('the default page renders the staff and key controls', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#svgTarget svg');
    // Editing grid present.
    await expect(page.locator('#hi-hat0')).toBeAttached();
    // Key controls present.
    for (const id of ['#groovesAnchor', '#helpAnchor', '#metronomeOff', '#timeSigLabel']) {
      await expect(page.locator(id)).toBeAttached();
    }
  });
});

test.describe('visual layout (screenshot backstop)', () => {
  // Pixel screenshots catch CSS/layout regressions that SVG-markup snapshots
  // don't. A small tolerance absorbs font-antialiasing noise. If these prove
  // environment-sensitive, re-baseline with --update-snapshots.
  const opts = { maxDiffPixelRatio: 0.02, animations: 'disabled' };

  test('default authoring view', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#svgTarget svg');
    await expect(page).toHaveScreenshot('home.png', opts);
  });

  test('a rendered 16th-note rock groove', async ({ page }) => {
    await loadGroove(
      page,
      grooveUrl(
        '?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|'
      )
    );
    await expect(page).toHaveScreenshot('rock16.png', opts);
  });
});
