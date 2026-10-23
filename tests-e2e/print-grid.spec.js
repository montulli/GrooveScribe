import { test, expect } from './fixtures.js';
import { loadGroove, getSvg, getMidi, grooveData } from './helpers.js';
import { coverageGrooves } from '../tests/fixtures/coverage-grooves.js';

const photograph =
  '/index.html?Mode=view&TimeSig=4/4&Div=16&Title=Photograph&Author=Ed%20Sheeran&Tempo=80&Measures=1&H=|x-x-x-x-x-x-x-x-|&S=|----O-------O---|&K=|o---o---o---o---|&T1=|----------------|&T4=|o-o-o-o-o-o-o-o-|';

async function preparePrint(page) {
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole('button', { name: 'PRINT GRID' }).click();
  await expect(page.locator('body')).toHaveClass(/printing-grid/);
  await page.emulateMedia({ media: 'print' });
}

test('prints the current grid and metadata without changing editor, URL, MIDI or notation', async ({
  page,
}) => {
  await loadGroove(page, photograph);
  const before = {
    data: await grooveData(page),
    svg: await getSvg(page),
    midi: await getMidi(page),
    url: page.url(),
  };
  const editor = await page.locator('#measureContainer').innerHTML();
  await preparePrint(page);
  await expect(page.locator('#gridPrintOutput h1')).toHaveText('Photograph');
  await expect(page.locator('#gridPrintOutput > p')).toHaveText('Ed Sheeran · 80 BPM · 4/4');
  await expect(page.locator('#gridPrintOutput tbody tr')).toHaveCount(5);
  await expect(page.locator('#gridPrintOutput .grid-print-note')).toHaveCount(80);
  await expect(page.locator('#gridPrintOutput [onclick], #gridPrintOutput button')).toHaveCount(0);
  await expect(page.locator('#GrooveWriter')).toBeHidden();
  await expect(page.locator('#gridPrintOutput')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#gridPrintOutput')).toHaveCount(0);
  expect(await page.locator('#measureContainer').innerHTML()).toBe(editor);
  expect({
    data: await grooveData(page),
    svg: await getSvg(page),
    midi: await getMidi(page),
    url: page.url(),
  }).toEqual(before);
  // Printing again works after cancel/close, and native print returns to notation.
  await preparePrint(page);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#sheetMusicDiv')).toBeVisible();
  await expect(page.locator('#musicalInput')).toBeHidden();
});

for (const [signature, division, measures] of [
  ['4/4', 8, 1],
  ['3/4', 16, 2],
  ['6/8', 16, 3],
  ['7/8', 32, 2],
  ['4/4', 24, 3],
  ['4/4', 48, 10],
]) {
  test(`paper layouts ${signature}, division ${division}, ${measures} measures`, async ({
    page,
  }) => {
    await loadGroove(page, `/index.html?TimeSig=${signature}&Div=${division}&Measures=${measures}`);
    await page.evaluate(() => window.myGrooveWriter.stickingsShowHide(true, true));
    const count = await page.locator('#measureContainer .hi-hat').count();
    await preparePrint(page);
    // No lost or duplicated subdivisions when splitting a measure.
    expect(await page.locator('#gridPrintOutput tbody .hh_cross').count()).toBe(count);
    await expect(page.locator('#gridPrintOutput tbody tr').first().locator('th')).toHaveText(
      'Stickings'
    );
    for (const width of [718, 740, 1040, 1080]) {
      // Conservative printable widths for A4/Letter, portrait/landscape.
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.locator('#gridPrintOutput').evaluate((root) => {
        const bounds = root.getBoundingClientRect();
        return [...root.querySelectorAll('table, .grid-print-note')].some((el) => {
          const rect = el.getBoundingClientRect();
          return rect.right > bounds.right + 1 || rect.left < bounds.left - 1;
        });
      });
      expect(overflow).toBe(false);
    }
  });
}

test('cleans up when browser printing fails and treats metadata as text', async ({ page }) => {
  await loadGroove(page, '/index.html?Title=%3Cb%3ENot%20HTML%3C%2Fb%3E');
  const result = await page.evaluate(async () => {
    window.print = () => {
      throw new Error('Print unavailable');
    };
    try {
      await window.myGrooveWriter.printGrid();
    } catch (error) {
      return error.message;
    }
  });
  expect(result).toBe('Print unavailable');
  await expect(page.locator('#gridPrintOutput')).toHaveCount(0);
  await preparePrint(page);
  await expect(page.locator('#gridPrintOutput h1')).toHaveText('<b>Not HTML</b>');
  await expect(page.locator('#gridPrintOutput h1 b')).toHaveCount(0);
});

test('preserves every articulation and sticking in the rendered cells', async ({ page }) => {
  const groove = coverageGrooves.find((item) => item.name === 'Everything at once (straight 16)');
  await loadGroove(page, '/index.html' + groove.url);
  const parts = (root) =>
    [...root.querySelectorAll('.note_part')].map((part) => {
      const clone = part.cloneNode(true);
      clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      clone.querySelectorAll('use').forEach((use) => {
        for (const attr of use.attributes) if (attr.localName === 'href') attr.value = '#reference';
      });
      return { style: part.getAttribute('style'), html: clone.innerHTML };
    });
  const before = await page.locator('#measureContainer').evaluate(parts);
  await preparePrint(page);
  expect(await page.locator('#gridPrintOutput').evaluate(parts)).toEqual(before);
  await expect(page.locator('#gridPrintOutput .snare_ghost').first()).toHaveCSS(
    'white-space',
    'nowrap'
  );
  expect(
    await page.locator('#gridPrintOutput use').evaluateAll((uses) =>
      uses.every((use) => {
        const href = use.getAttribute('xlink:href') || use.getAttribute('href');
        const target = document.querySelector(href);
        return href.startsWith('#grid-print-') && use.closest('svg').contains(target);
      })
    )
  ).toBe(true);
  // Filled notes are drawn with borders, independent of background printing.
  await expect(page.locator('#gridPrintOutput .grid-print-filled').first()).toHaveCSS(
    'border-top-color',
    'rgb(0, 0, 0)'
  );
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#gridPrintOutput')).toBeHidden();
  await expect(page.locator('#GrooveWriter')).toBeVisible();
});

for (const [signature, division, expected] of [
  ['4/4', 8, '1 + 2 + 3 + 4 +'],
  ['4/4', 16, '1 e + a 2 e + a 3 e + a 4 e + a'],
  ['4/4', 12, '1 tri plet 2 tri plet 3 tri plet 4 tri plet'],
  [
    '4/4',
    24,
    '1 tri plet + tri plet 2 tri plet + tri plet 3 tri plet + tri plet 4 tri plet + tri plet',
  ],
  ['4/4', 32, '1 ta e ta + ta a ta 2 ta e ta + ta a ta 3 ta e ta + ta a ta 4 ta e ta + ta a ta'],
  ['3/4', 16, '1 e + a 2 e + a 3 e + a'],
  ['6/8', 16, '1 + 2 + 3 + 4 + 5 + 6 +'],
  ['7/8', 8, '1 2 3 4 5 6 7'],
]) {
  test(`practice counts ${signature}, division ${division}`, async ({ page }) => {
    await loadGroove(page, `/index.html?TimeSig=${signature}&Div=${division}&Measures=2`);
    await preparePrint(page);
    const counts = await page.locator('#gridPrintOutput thead th[scope="col"]').allTextContents();
    expect(counts).toEqual([...expected.split(' '), ...expected.split(' ')]);
    const overflow = await page
      .locator('#gridPrintOutput thead th')
      .evaluateAll((cells) => cells.some((cell) => cell.scrollWidth > cell.clientWidth + 1));
    expect(overflow).toBe(false);
  });
}
