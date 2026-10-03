import { test, expect } from './fixtures.js';
import { grooveUrl } from './corpus.js';
import {
  loadGroove,
  getSvg,
  grooveData,
  openGroup,
  chooseFromGroup,
  openGrooveSetup,
} from './helpers.js';

// Functional end-to-end flows: drive the real UI and assert observable results.
// These cover the wiring the jsdom unit tests can only approximate — real clicks,
// real re-rendering, real menus.

const EMPTY_16 =
  '?TimeSig=4/4&Div=16&Tempo=80&Measures=1' +
  '&H=|----------------|&S=|----------------|&K=|----------------|';

test.beforeEach(async ({ page }) => {
  await loadGroove(page, grooveUrl(EMPTY_16));
});

test.describe('grid editing', () => {
  test('clicking a hi-hat cell turns a note on and re-renders the sheet music', async ({
    page,
  }) => {
    expect((await grooveData(page)).hhOn).toBe(0);
    await page.click('#hi-hat0');
    expect((await grooveData(page)).hhOn).toBe(1);
    // Sheet music re-rendered after the edit.
    expect(await getSvg(page)).toContain('<svg');
  });

  test('Edit > Clear all empties the grid', async ({ page }) => {
    await page.click('#hi-hat0');
    await page.click('#snare4');
    expect((await grooveData(page)).hhOn).toBeGreaterThan(0);
    await chooseFromGroup(page, 'editAnchor', 'clearAllNotesButton');
    const gd = await grooveData(page);
    expect(gd.hhOn).toBe(0);
    expect(gd.snareOn).toBe(0);
  });

  test('Edit > Undo reverts an edit and Edit > Redo re-applies it', async ({ page }) => {
    await page.click('#hi-hat0');
    expect((await grooveData(page)).hhOn).toBe(1);
    await chooseFromGroup(page, 'editAnchor', 'undoButton');
    expect((await grooveData(page)).hhOn).toBe(0);
    await chooseFromGroup(page, 'editAnchor', 'redoButton');
    expect((await grooveData(page)).hhOn).toBe(1);
  });

  test('Ctrl-Z and Ctrl-Y undo and redo', async ({ page }) => {
    await page.click('#hi-hat0');
    expect((await grooveData(page)).hhOn).toBe(1);
    await page.keyboard.press('Control+z');
    expect((await grooveData(page)).hhOn).toBe(0);
    await page.keyboard.press('Control+y');
    expect((await grooveData(page)).hhOn).toBe(1);
  });
});

test.describe('division & structure', () => {
  test('changing the subdivision in Groove Setup updates notes-per-measure', async ({ page }) => {
    expect((await grooveData(page)).notesPerMeasure).toBe(16);

    await openGrooveSetup(page);
    await page.selectOption('#subdivisionSelect', '8');
    await page.click('#grooveSetupModalDone');
    expect((await grooveData(page)).notesPerMeasure).toBe(8);

    await openGrooveSetup(page);
    await page.selectOption('#subdivisionSelect', '12');
    await page.click('#grooveSetupModalDone');
    const gd = await grooveData(page);
    expect(gd.notesPerMeasure).toBe(12);
    expect(gd.timeDivision).toBe(12);
  });

  test('changing the time signature in Groove Setup applies on Done', async ({ page }) => {
    await openGrooveSetup(page);
    await page.selectOption('#timeSigPopupTimeSigTop', '3');
    // staged only: nothing has changed yet
    expect(Number((await grooveData(page)).numBeats)).toBe(4);
    await page.click('#grooveSetupModalDone');
    const gd = await grooveData(page);
    // (the time signature comes from the dropdowns as strings)
    expect(Number(gd.numBeats)).toBe(3);
    expect(Number(gd.noteValue)).toBe(4);
    await expect(page.locator('#timeSigLabel')).toHaveText('3/4');
  });

  test('adding and removing a measure changes the measure count', async ({ page }) => {
    expect((await grooveData(page)).numberOfMeasures).toBe(1);
    await page.evaluate(() => window.myGrooveWriter.addMeasureButtonClick(1));
    expect((await grooveData(page)).numberOfMeasures).toBe(2);
    await page.evaluate(() => window.myGrooveWriter.closeMeasureButtonClick(2));
    expect((await grooveData(page)).numberOfMeasures).toBe(1);
  });

  test('Display > Show toms flips showToms and keeps the sheet rendering', async ({ page }) => {
    const before = (await grooveData(page)).showToms;
    await chooseFromGroup(page, 'displayAnchor', 'showHideTomsButton');
    expect((await grooveData(page)).showToms).toBe(!before);
    expect(await getSvg(page)).toContain('<svg');
  });
});

test.describe('menus & popups', () => {
  test('grooves menu opens', async ({ page }) => {
    await openGroup(page, 'groovesAnchor');
    await expect(page.locator('#grooveListWrapper')).toBeVisible();
  });

  test('help menu opens', async ({ page }) => {
    await openGroup(page, 'helpAnchor');
    await expect(page.locator('#helpContextMenu')).toBeVisible();
  });

  test('Share & Export > Share link shows the current groove URL', async ({ page }) => {
    await chooseFromGroup(page, 'shareExportAnchor', 'shareSaveButton');
    await expect(page.locator('#fullURLPopup')).toBeVisible();
    const shared = await page.inputValue('#fullURLPopupTextField');
    expect(shared).toContain('TimeSig=4/4');
  });
});

test.describe('playback', () => {
  test('pressing play starts MIDI playback', async ({ page }) => {
    await page.click('[id^="midiPlayImage"]');
    // Playback becomes active once the soundfont is ready.
    await expect
      .poll(() => page.evaluate(() => window.myGrooveWriter.myGrooveUtils.isPlaying()), {
        timeout: 15000,
      })
      .toBe(true);
    // Stop again cleanly and confirm playback ends.
    await page.evaluate(() => window.myGrooveWriter.myGrooveUtils.stopMIDI_playback());
    const stillPlaying = await page.evaluate(() => window.myGrooveWriter.myGrooveUtils.isPlaying());
    expect(stillPlaying).toBe(false);
  });
});

test.describe('export', () => {
  test('the ABC source is generated and the Share & Export menu lists the exports', async ({
    page,
  }) => {
    const abc = await page.inputValue('#ABCsource');
    expect(abc).toContain('X:');
    await openGroup(page, 'shareExportAnchor');
    await expect(page.locator('#shareExportContextMenu')).toBeVisible();
    for (const id of ['#shareSaveButton', '#printButton', '#downloadSVGButton']) {
      await expect(page.locator(id)).toBeVisible();
    }
    await expect(page.locator('#downloadPNGButton')).toBeVisible();
    await expect(page.locator('#downloadMIDIButton')).toBeVisible();
  });
});
