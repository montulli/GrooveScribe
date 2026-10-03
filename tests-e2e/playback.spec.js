import { test, expect } from './fixtures.js';
import { grooveUrl } from './corpus.js';
import { loadGroove, openGroup } from './helpers.js';

// Playback timing and cost: the loop must stay on the beat even when the page is busy (phones),
// nothing may keep sounding or lighting up after Stop, and the page must not redo expensive work
// (re-render the music, rewrite text) while the groove plays.

// 2 measures of 16ths at 140 BPM with a 16th-note metronome: a busy groove, ~3.4s per pass
const BUSY =
  '?TimeSig=4/4&Div=16&Tempo=140&Measures=2&MetronomeFreq=16' +
  '&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|&S=|----O-------O---|----O--O----O---|' +
  '&K=|o---------o-----|o--o------o-----|';
// one short measure at 200 BPM (1.2s per pass): many loop restarts in a few seconds
const SHORT =
  '?TimeSig=4/4&Div=16&Tempo=200&Measures=1' +
  '&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o---------o-----|';

// record the audio-clock time every note is scheduled at
async function recordScheduledNotes(page) {
  await page.evaluate(() => {
    const scheduled = (window.__scheduled = []);
    const noteOn = window.MIDI.noteOn;
    window.MIDI.noteOn = function (channel, note, velocity, when) {
      scheduled.push(when);
      return noteOn.apply(this, arguments);
    };
  });
}

const play = (page) => page.click('[id^="midiPlayImage"]');
const isPlaying = (page) => page.evaluate(() => window.MIDI.Player.playing);

test.describe('looping stays on the beat', () => {
  // A phone whose main thread is busy delays timers. The next pass of the loop used to be started
  // from the last note's timer, so every repeat slipped by however late that timer was.
  for (const jank of [0, 100]) {
    test(`with ${jank}ms of main-thread jank every 250ms`, async ({ page }) => {
      await loadGroove(page, grooveUrl(BUSY));
      await recordScheduledNotes(page);
      if (jank) {
        await page.evaluate((ms) => {
          setInterval(() => {
            const start = performance.now();
            while (performance.now() - start < ms);
          }, 250);
        }, jank);
      }
      await play(page);
      await page.waitForTimeout(11000); // three passes
      const times = await page.evaluate(() => window.__scheduled);

      // every note must land on the 16th-note grid, give or take a beat's worth of rounding
      const step = 60 / 140 / 4;
      const onsets = [...new Set(times.map((t) => t.toFixed(5)))].map(Number);
      expect(onsets.length).toBeGreaterThan(80);
      const gaps = onsets.slice(1).map((t, i) => (t - onsets[i]) * 1000);
      const irregular = gaps.filter(
        (g) => Math.abs(Math.round(g / (step * 1000)) * step * 1000 - g) > 8
      );
      expect(irregular, `spacing off the 16th grid (ms): ${irregular.join(', ')}`).toEqual([]);
    });
  }

  test('the loop keeps lighting up the notes pass after pass', async ({ page }) => {
    await loadGroove(page, grooveUrl(SHORT));
    await page.evaluate(() => {
      window.__lit = 0;
      new MutationObserver((records) => {
        for (const r of records) {
          if (/highlighted/.test(r.target.getAttribute('class') || '')) window.__lit++;
        }
      }).observe(document.getElementById('svgTarget'), { attributes: true, subtree: true });
    });
    await play(page);
    await page.waitForTimeout(2500);
    const early = await page.evaluate(() => window.__lit);
    await page.waitForTimeout(4000); // three more passes
    const later = await page.evaluate(() => window.__lit);
    expect(later).toBeGreaterThan(early + 20);
    expect(await isPlaying(page)).toBe(true);
  });
});

test.describe('stopping really stops', () => {
  test('Stop silences notes already queued and clears the highlight', async ({ page }) => {
    await loadGroove(page, grooveUrl(SHORT));
    await recordScheduledNotes(page);
    await play(page);
    await page.waitForTimeout(2600);
    await page.keyboard.press('Space');
    const queuedAtStop = await page.evaluate(() => window.__scheduled.length);
    await page.waitForTimeout(2000);
    expect(await isPlaying(page)).toBe(false);
    expect(await page.evaluate(() => window.__scheduled.length)).toBe(queuedAtStop);
    expect(await page.locator('#svgTarget .highlighted').count()).toBe(0);
  });

  test('editing while it plays, then Stop, leaves no stray note or highlight', async ({ page }) => {
    // an edit makes the loop reload its MIDI at the end of a pass; the player used to lose track
    // of one queued note per pass after that, which then fired after Stop
    for (const wait of [3500, 3650, 3800]) {
      await loadGroove(page, grooveUrl(SHORT));
      await play(page);
      await page.waitForTimeout(2200);
      await page.evaluate(() => window.myGrooveWriter.noteLeftClick({}, 'kick', 4));
      await page.waitForTimeout(wait);
      await page.keyboard.press('Space');
      await page.waitForTimeout(600);
      expect(await isPlaying(page)).toBe(false);
      expect(await page.locator('#svgTarget .highlighted').count(), `stopped after ${wait}ms`).toBe(
        0
      );
    }
  });

  test('pause then resume keeps playing, and nothing plays while paused', async ({ page }) => {
    await loadGroove(page, grooveUrl(SHORT));
    await recordScheduledNotes(page);
    await play(page);
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.myGrooveWriter.myGrooveUtils.pauseMIDI_playback());
    await page.waitForTimeout(300);
    const paused = await page.evaluate(() => window.__scheduled.length);
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__scheduled.length)).toBe(paused);
    await page.evaluate(() => window.myGrooveWriter.myGrooveUtils.startMIDI_playback());
    await page.waitForTimeout(2000);
    expect(await isPlaying(page)).toBe(true);
    expect(await page.evaluate(() => window.__scheduled.length)).toBeGreaterThan(paused);
  });
});

test.describe('the page does not do needless work while playing', () => {
  test('resizing only the height (a phone address bar) does not redraw the music', async ({
    page,
  }) => {
    await loadGroove(page, grooveUrl(BUSY));
    await page.evaluate(() => {
      window.__redraws = 0;
      new MutationObserver((records) => (window.__redraws += records.length)).observe(
        document.getElementById('svgTarget'),
        { childList: true }
      );
    });
    const { width, height } = page.viewportSize();
    await page.setViewportSize({ width, height: height - 80 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__redraws)).toBe(0);
  });

  test('a width change still redraws the music to fit, once resizing settles', async ({ page }) => {
    await loadGroove(page, grooveUrl(BUSY));
    const before = await page.locator('#svgTarget svg').getAttribute('width');
    const { width, height } = page.viewportSize();
    for (const w of [width - 100, width - 200, width - 300]) {
      await page.setViewportSize({ width: w, height });
      await page.waitForTimeout(40); // a drag: several resize events in quick succession
    }
    await expect.poll(() => page.locator('#svgTarget svg').getAttribute('width')).not.toBe(before);
  });

  test('the play time text is not rewritten for every note', async ({ page }) => {
    await loadGroove(page, grooveUrl(BUSY));
    await page.evaluate(() => {
      window.__writes = 0;
      const watch = (el) =>
        el &&
        new MutationObserver((records) => (window.__writes += records.length)).observe(el, {
          childList: true,
        });
      watch(document.querySelector('[id^="MIDIPlayTime"]'));
      watch(document.getElementById('totalPlayTime'));
    });
    await play(page);
    await page.waitForTimeout(6000); // ~250 notes
    const writes = await page.evaluate(() => window.__writes);
    expect(writes).toBeLessThan(30); // about two per second, not one or two per note
  });
});

test('the menu still works while a groove is playing', async ({ page }) => {
  await loadGroove(page, grooveUrl(SHORT));
  await play(page);
  await page.waitForTimeout(800);
  await openGroup(page, 'displayAnchor');
  await expect(page.locator('#displayContextMenu')).toBeVisible();
  expect(await isPlaying(page)).toBe(true);
});
