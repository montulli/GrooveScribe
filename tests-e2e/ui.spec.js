import { test, expect } from './fixtures.js';
import { grooveUrl } from './corpus.js';
import {
  loadGroove,
  getSvg,
  grooveData,
  openMenu,
  openGroup,
  chooseFromGroup,
  openGrooveSetup,
} from './helpers.js';

// The redesigned UX: hamburger menu with cascading groups, the Groove Setup dialog, the
// metronome Options menu and its dialog, the top bar, the phone behaviour and the info pages.

const GROOVE =
  '?TimeSig=4/4&Div=16&Tempo=80&Measures=1' +
  '&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o---------o-----|';

const GREEN = 'rgb(98, 192, 76)';

// labels of the top-level menu items that are currently visible
function visibleMenuLabels(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#hamburgerMenu > .menuItem')]
      .filter((el) => el.offsetHeight > 0)
      .map((el) => el.querySelector('.menuLabel').textContent.trim())
  );
}

// the visible entries of one popup menu
function visibleEntries(page, menuId) {
  return page.evaluate(
    (id) =>
      [...document.querySelectorAll(`#${id} li`)]
        .filter((el) => el.offsetHeight > 0)
        .map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    menuId
  );
}

test.beforeEach(async ({ page }) => {
  await loadGroove(page, grooveUrl(GROOVE));
});

test.describe('hamburger menu', () => {
  test('lists the top-level items, and drops Edit in View mode', async ({ page }) => {
    await openMenu(page);
    expect(await visibleMenuLabels(page)).toEqual([
      'Groove setup',
      'Edit',
      'Display',
      'Permutations',
      'Grooves',
      'Share & Export',
      'Help',
    ]);

    await page.click('#hamburgerButton'); // close
    await page.click('#viewEditButton'); // -> View mode
    await openMenu(page);
    expect(await visibleMenuLabels(page)).toEqual([
      'Groove setup',
      'Display',
      'Permutations',
      'Grooves',
      'Share & Export',
      'Help',
    ]);
  });

  test('its right edge lines up with the hamburger icon, and it opens just under the top bar', async ({
    page,
  }) => {
    await openMenu(page);
    const box = await page.evaluate(() => {
      const panel = document.getElementById('hamburgerMenu').getBoundingClientRect();
      const icon = document.querySelector('#hamburgerButton i').getBoundingClientRect();
      const bar = document.getElementById('TopNav').getBoundingClientRect();
      return {
        panelRight: panel.right,
        iconRight: icon.right,
        panelTop: panel.top,
        barBottom: bar.bottom,
      };
    });
    expect(Math.abs(box.panelRight - box.iconRight)).toBeLessThanOrEqual(1);
    expect(box.panelTop).toBeGreaterThanOrEqual(box.barBottom);
  });

  test('closes when you tap away from it', async ({ page }) => {
    await openMenu(page);
    await expect(page.locator('#hamburgerMenu')).toBeVisible();
    await page.mouse.click(5, 300);
    await expect(page.locator('#hamburgerMenu')).toBeHidden();
  });

  test('a group opens its submenu and keeps the main menu open', async ({ page }) => {
    await openGroup(page, 'editAnchor');
    await expect(page.locator('#editContextMenu')).toBeVisible();
    await expect(page.locator('#hamburgerMenu')).toBeVisible();
    expect(await visibleEntries(page, 'editContextMenu')).toEqual([
      'Undo Ctrl-Z',
      'Redo Ctrl-Y',
      'Clear all',
    ]);
  });

  test('Share & Export lists share, print and the three downloads', async ({ page }) => {
    await openGroup(page, 'shareExportAnchor');
    expect(await visibleEntries(page, 'shareExportContextMenu')).toEqual([
      'Share link',
      'Print',
      'Download SVG images',
      'Download PNG images',
      'Download MIDI file',
    ]);
  });

  test('Help lists Help and About (undo and redo moved to Edit)', async ({ page }) => {
    await openGroup(page, 'helpAnchor');
    expect(await visibleEntries(page, 'helpContextMenu')).toEqual(['Help', 'About']);
  });

  test('Display toggles read Show / Hide and flip when used', async ({ page }) => {
    await openGroup(page, 'displayAnchor');
    expect(await visibleEntries(page, 'displayContextMenu')).toEqual([
      'Show toms',
      'Show stickings',
      'Show legend',
      'Reverse stickings R/L',
    ]);
    await page.click('#showHideTomsButton');
    await openGroup(page, 'displayAnchor');
    await page.click('#stickingsButton');
    await openGroup(page, 'displayAnchor');
    await page.click('#legendButton');

    await openGroup(page, 'displayAnchor');
    expect(await visibleEntries(page, 'displayContextMenu')).toEqual([
      'Hide toms',
      'Hide stickings',
      'Hide legend',
      'Reverse stickings R/L',
    ]);
    const gd = await grooveData(page);
    expect(gd.showToms).toBe(true);
    expect(gd.showStickings).toBe(true);
    // the legend adds its key to the music
    expect(await getSvg(page)).toContain('Hi-Hat');
  });

  test('Display > Show legend toggles the key on the music and back', async ({ page }) => {
    const plain = await getSvg(page);
    await chooseFromGroup(page, 'displayAnchor', 'legendButton');
    await expect.poll(async () => (await getSvg(page)) !== plain).toBe(true);
    await chooseFromGroup(page, 'displayAnchor', 'legendButton');
    await expect.poll(async () => (await getSvg(page)) === plain).toBe(true);
  });

  test('Permutations says why it is disabled outside 4/4', async ({ page }) => {
    await openGrooveSetup(page);
    await page.selectOption('#timeSigPopupTimeSigTop', '3');
    await page.click('#grooveSetupModalDone');

    await openGroup(page, 'permutationAnchor');
    await expect(page.locator('#permutationDisabledContextMenu')).toBeVisible();
    await expect(page.locator('#permutationDisabledContextMenu')).toContainText(
      'Permutations disabled if not in 4/4 time'
    );
    await expect(page.locator('#permutationContextMenu')).toBeHidden();
  });

  test('Permutations offers Kick and Snare permutations in 4/4', async ({ page }) => {
    await openGroup(page, 'permutationAnchor');
    await expect(page.locator('#permutationContextMenu')).toBeVisible();
    await expect(page.locator('#permutationDisabledContextMenu')).toBeHidden();
  });
});

test.describe('Groove Setup dialog', () => {
  test('stages everything: Cancel discards, Done applies', async ({ page }) => {
    await openGrooveSetup(page);
    await page.fill('#tuneTitle', 'My Groove');
    await page.selectOption('#timeSigPopupTimeSigTop', '3');
    // nothing is applied while the dialog is open
    expect(await getSvg(page)).not.toContain('My Groove');
    await expect(page.locator('#timeSigLabel')).toHaveText('4/4');

    await page.click('#grooveSetupModalCancel');
    await expect(page.locator('#grooveSetupModal')).toBeHidden();
    expect(await page.inputValue('#tuneTitle')).toBe('');
    await expect(page.locator('#timeSigLabel')).toHaveText('4/4');

    await openGrooveSetup(page);
    await page.fill('#tuneTitle', 'My Groove');
    await page.fill('#tuneAuthor', 'Lou');
    await page.selectOption('#timeSigPopupTimeSigTop', '3');
    await page.click('#grooveSetupModalDone');
    await expect(page.locator('#timeSigLabel')).toHaveText('3/4');
    const svg = await getSvg(page);
    expect(svg).toContain('My Groove');
    expect(svg).toContain('Lou');
    const url = await page.evaluate(() => location.search);
    expect(url).toContain('Title=My%20Groove');
    expect(url).toContain('TimeSig=3/4');
  });

  test('tapping outside does not dismiss it', async ({ page }) => {
    await openGrooveSetup(page);
    await page.fill('#tuneTitle', 'kept');
    await page.mouse.click(5, 300); // the backdrop
    await expect(page.locator('#grooveSetupModal')).toBeVisible();
    expect(await page.inputValue('#tuneTitle')).toBe('kept');
  });

  test('each text box has a clear button that appears only when there is text', async ({
    page,
  }) => {
    await openGrooveSetup(page);
    const clear = page.locator('[aria-label="Clear title"]');
    await expect(clear).toBeHidden();
    await page.fill('#tuneTitle', 'something');
    await expect(clear).toBeVisible();
    await clear.click();
    expect(await page.inputValue('#tuneTitle')).toBe('');
    await expect(clear).toBeHidden();
  });

  test('a time signature that rules a subdivision out disables it', async ({ page }) => {
    await openGrooveSetup(page);
    await page.selectOption('#timeSigPopupTimeSigBottom', '8');
    await page.click('#grooveSetupModalDone');
    await openGrooveSetup(page);
    await expect(page.locator('#subdivisionSelect option[value="12"]')).toBeDisabled();
    await expect(page.locator('#subdivisionSelect option[value="16"]')).toBeEnabled();
  });

  test('the legend is no longer in the dialog (it moved to Display)', async ({ page }) => {
    await openGrooveSetup(page);
    await expect(page.locator('#grooveSetupModal #showLegend')).toHaveCount(0);
  });
});

test.describe('top bar', () => {
  test('the View / Edit button names the mode it switches to', async ({ page }) => {
    await expect(page.locator('#view-edit-switch')).toHaveText('View mode');
    await page.click('#viewEditButton');
    await expect(page.locator('#view-edit-switch')).toHaveText('Edit mode');
  });

  test('the top bar and the player bar touch, with the music right below', async ({ page }) => {
    const edges = await page.evaluate(() => {
      const bottom = (id) => document.getElementById(id).getBoundingClientRect().bottom;
      const top = (id) => document.getElementById(id).getBoundingClientRect().top;
      return {
        navBottom: bottom('TopNav'),
        playerTop: top('midiPlayer'),
        playerBottom: bottom('midiPlayer'),
        contentTop: top('RightHandContent'),
      };
    });
    expect(edges.playerTop).toBe(edges.navBottom);
    expect(edges.contentTop).toBe(edges.playerBottom);
  });

  test('the metronome row never runs into the View / Edit button, at any width', async ({
    page,
  }) => {
    for (const width of [1280, 800, 700, 661, 660, 600, 521, 480, 390, 360]) {
      await page.setViewportSize({ width, height: 600 });
      const gap = await page.evaluate(() => {
        const options = document.getElementById('metronomeOptionsAnchor').getBoundingClientRect();
        const pill = document.getElementById('viewEditButton').getBoundingClientRect();
        return pill.left - options.right;
      });
      expect(gap, `at ${width}px wide`).toBeGreaterThan(0);
    }
  });

  test('the BPM and Swing sliders are the same height and fill their rows', async ({ page }) => {
    const sliders = await page.evaluate(() =>
      ['tempoInput', 'swingInput'].map((cls) => {
        const slider = document.querySelector(`#midiPlayer .${cls}`);
        return {
          height: slider.getBoundingClientRect().height,
          row: slider.parentElement.getBoundingClientRect().height,
        };
      })
    );
    expect(sliders[0].height).toBeGreaterThan(0);
    expect(sliders[0].height).toBe(sliders[1].height);
    expect(sliders[0].height).toBe(sliders[0].row);
  });

  test('the Auto Speed Up sliders are the same height', async ({ page }) => {
    await page.click('#metronomeOptionsAnchor');
    await page.click('#metronomeOptionsContextMenuSpeedUp');
    const heights = await page.evaluate(() =>
      ['metronomeAutoSpeedupTempoIncreaseAmount', 'metronomeAutoSpeedupTempoIncreaseInterval'].map(
        (id) => document.getElementById(id).getBoundingClientRect().height
      )
    );
    expect(heights[0]).toBeGreaterThan(0);
    expect(heights[0]).toBe(heights[1]);
  });

  test('the selected metronome interval is green', async ({ page }) => {
    const color = (id) =>
      page.evaluate((i) => getComputedStyle(document.getElementById(i)).color, id);
    expect(await color('metronomeOff')).toBe(GREEN);
    await page.click('#metronome8ths');
    await page.mouse.move(5, 400);
    await expect.poll(() => color('metronome8ths')).toBe(GREEN);
    expect(await color('metronomeOff')).not.toBe(GREEN);
  });
});

test.describe('metronome options', () => {
  const entries = (page) => visibleEntries(page, 'metronomeOptionsContextMenu');

  test('the menu uses the new wording', async ({ page }) => {
    await page.click('#metronomeOptionsAnchor');
    expect(await entries(page)).toEqual([
      'Metronome only',
      'Auto speed up',
      'Count it in',
      'Offset click',
    ]);
  });

  test('Offset click cascades: the parent stays up, a second click closes only the submenu', async ({
    page,
  }) => {
    const shown = (id) => page.locator('#' + id).isVisible();
    await page.click('#metronomeOptionsAnchor');
    await page.click('#metronomeOptionsContextMenuOffTheOne');
    expect(await shown('metronomeOptionsContextMenu')).toBe(true);
    expect(await shown('metronomeOptionsOffsetClickContextMenu')).toBe(true);

    await page.click('#metronomeOptionsContextMenuOffTheOne');
    expect(await shown('metronomeOptionsContextMenu')).toBe(true);
    expect(await shown('metronomeOptionsOffsetClickContextMenu')).toBe(false);
  });

  test('choosing an offset applies it and closes both menus', async ({ page }) => {
    await page.click('#metronomeOptionsAnchor');
    await page.click('#metronomeOptionsContextMenuOffTheOne');
    // popups only start closing on an outside tap 100ms after they open (so the opening tap does
    // not close them); a person is never that quick, so wait it out
    await page.waitForTimeout(150);
    await page.click('#metronomeOptionsOffsetClickContextMenuOnTheE');
    await expect(page.locator('#metronomeOptionsContextMenu')).toBeHidden();
    await expect(page.locator('#metronomeOptionsOffsetClickContextMenu')).toBeHidden();
    await expect(page.locator('#metronomeOptionsAnchor')).toHaveClass(/selected/);
  });

  test('Metronome only checks itself and starts the metronome', async ({ page }) => {
    await page.click('#metronomeOptionsAnchor');
    await page.click('#metronomeOptionsContextMenuSolo');
    await expect(page.locator('#metronomeOptionsContextMenuSolo')).toHaveClass(/menuChecked/);
    await expect(page.locator('#metronome4ths')).toHaveClass(/buttonSelected/);
  });

  test('Count it in toggles without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.click('#metronomeOptionsAnchor');
    await page.click('#metronomeOptionsContextMenuCountIn');
    await expect(page.locator('#metronomeOptionsContextMenuCountIn')).toHaveClass(/menuChecked/);
    await expect(page.locator('#metronomeOptionsAnchor')).toHaveClass(/selected/);

    await page.click('#metronomeOptionsAnchor');
    await page.click('#metronomeOptionsContextMenuCountIn');
    await expect(page.locator('#metronomeOptionsContextMenuCountIn')).not.toHaveClass(
      /menuChecked/
    );
    expect(errors).toEqual([]);
  });

  test.describe('Auto speed up dialog', () => {
    const open = async (page) => {
      await page.click('#metronomeOptionsAnchor');
      await page.click('#metronomeOptionsContextMenuSpeedUp');
      await expect(page.locator('#metronomeAutoSpeedupConfiguration')).toBeVisible();
    };
    const setAmount = async (page, value) => {
      await page.locator('#metronomeAutoSpeedupTempoIncreaseAmount').fill(String(value));
      await page.dispatchEvent('#metronomeAutoSpeedupTempoIncreaseAmount', 'input');
    };

    test('opens as a dialog that tapping outside does not dismiss', async ({ page }) => {
      await open(page);
      await page.mouse.click(5, 300);
      await expect(page.locator('#metronomeAutoSpeedupConfiguration')).toBeVisible();
    });

    test('the summary follows the sliders', async ({ page }) => {
      await open(page);
      await setAmount(page, 30);
      await expect(page.locator('#metronomeAutoSpeedupTempoIncreaseAmountOutput')).toHaveText('30');
    });

    test('Cancel restores the settings and turns Auto speed up back off', async ({ page }) => {
      await open(page);
      await setAmount(page, 30);
      await page.uncheck('#metronomeAutoSpeedUpKeepGoingForever');
      await page.click('#metronomeAutoSpeedupConfiguration .navModalCancel');

      await expect(page.locator('#metronomeAutoSpeedupConfiguration')).toBeHidden();
      expect(await page.inputValue('#metronomeAutoSpeedupTempoIncreaseAmount')).toBe('5');
      await expect(page.locator('#metronomeAutoSpeedUpKeepGoingForever')).toBeChecked();
      await expect(page.locator('#metronomeOptionsContextMenuSpeedUp')).not.toHaveClass(
        /menuChecked/
      );
    });

    test('Done keeps the settings and leaves it on', async ({ page }) => {
      await open(page);
      await setAmount(page, 30);
      await page.click('#metronomeAutoSpeedupConfiguration .navModalDone');

      await expect(page.locator('#metronomeAutoSpeedupConfiguration')).toBeHidden();
      expect(await page.inputValue('#metronomeAutoSpeedupTempoIncreaseAmount')).toBe('30');
      await expect(page.locator('#metronomeOptionsContextMenuSpeedUp')).toHaveClass(/menuChecked/);
    });
  });
});

test.describe('phones', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  test('Advanced Edit starts on and shows a check in the Edit menu', async ({ page }) => {
    await page.reload();
    await page.waitForSelector('#svgTarget svg');
    await openGroup(page, 'editAnchor');
    await expect(page.locator('#advancedEditAnchor')).toBeVisible();
    await expect(page.locator('#advancedEditAnchor')).toHaveClass(/buttonSelected/);
  });

  test('Advanced Edit can be switched off', async ({ page }) => {
    await page.reload();
    await page.waitForSelector('#svgTarget svg');
    await chooseFromGroup(page, 'editAnchor', 'advancedEditAnchor');
    await openGroup(page, 'editAnchor');
    await expect(page.locator('#advancedEditAnchor')).not.toHaveClass(/buttonSelected/);
  });

  test('the page does not scroll sideways', async ({ page }) => {
    await page.reload();
    await page.waitForSelector('#svgTarget svg');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });

  test('the Groove Setup dialog fits on the screen', async ({ page }) => {
    await page.reload();
    await page.waitForSelector('#svgTarget svg');
    await openGrooveSetup(page);
    const card = await page.evaluate(() => {
      const r = document.getElementById('grooveSetupModalCard').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    expect(card.top).toBeGreaterThanOrEqual(0);
    expect(card.bottom).toBeLessThanOrEqual(844);
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(390);
  });
});

test.describe('desktop', () => {
  test('there is no Advanced Edit item without touch', async ({ page }) => {
    await expect(page.locator('#advancedEditAnchor')).toHaveCount(0);
  });
});

test.describe('info pages', () => {
  for (const [file, heading, sections] of [
    ['/gscribe_about.html', 'About GrooveScribe', 6],
    ['/gscribe_help.html', 'GrooveScribe Help', 12],
  ]) {
    test(`${file} renders in the app style without errors`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(file);
      await expect(page.locator('h1')).toHaveText(heading);
      await expect(page.locator('main section')).toHaveCount(sections);
      // the shared stylesheet is applied: the app's dark background
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(bg).toBe('rgb(57, 57, 57)');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflow).toBe(false);
      expect(errors).toEqual([]);
    });
  }

  for (const file of ['/gscribe_help.html', '/gscribe_about.html']) {
    test(`${file}: "Open GrooveScribe" opens a fully styled editor`, async ({ page }) => {
      const missing = [];
      page.on('response', (r) => {
        if (r.url().includes('/css/') && r.status() >= 400) missing.push(r.url());
      });
      await page.goto(file);
      await page.click('a.open');
      await page.waitForSelector('#svgTarget svg');
      expect(missing, 'stylesheets that failed to load').toEqual([]);
      // the top bar gradient and the player bar both come from the stylesheets
      const styles = await page.evaluate(() => ({
        header: getComputedStyle(document.getElementById('TopNav')).backgroundImage,
        player: getComputedStyle(document.querySelector('.playerControl')).backgroundColor,
        bpm: getComputedStyle(document.querySelector('.tempoRow')).display,
      }));
      expect(styles.header).toContain('linear-gradient');
      expect(styles.player).toBe('rgb(34, 34, 34)');
      expect(styles.bpm).toBe('flex');
    });
  }

  test('every help contents link points at a section on the page', async ({ page }) => {
    await page.goto('/gscribe_help.html');
    const hrefs = await page.$$eval('.toc a', (links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs).toHaveLength(12);
    for (const href of hrefs) {
      await expect(page.locator(href), href).toHaveCount(1);
    }
  });

  test('the About "Built with" list matches what the app loads', async ({ page }) => {
    await page.goto('/gscribe_about.html');
    const text = await page.locator('main').innerText();
    for (const name of ['abc2svg', 'jsmidgen', 'MIDI.js', 'unmute', 'Capacitor', 'Font Awesome']) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('Firebase');
  });

  test('the menu opens the Help and About pages', async ({ page, context }) => {
    await openGroup(page, 'helpAnchor');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#helpContextMenu li:first-child'),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain('gscribe_help.html');
  });
});

test.describe('native app screen rotation', () => {
  // the row holds both labels; only one is visible
  const rowLabel = (page) =>
    page.evaluate(() => document.getElementById('screenRotationButton').innerText.trim());

  test('the rotation row is hidden on the web', async ({ page }) => {
    await openGroup(page, 'displayAnchor');
    await expect(page.locator('#screenRotationButton')).toBeHidden();
  });

  test.describe('inside a native app', () => {
    // Capacitor's bridge is injected into the WebView by the native app; stand in for it
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const calls = (window.__orientationCalls = []);
        window.Capacitor = {
          isNativePlatform: () => true,
          registerPlugin: () => ({
            lock: (options) => calls.push(['lock', options.orientation]),
            unlock: () => calls.push(['unlock']),
          }),
        };
      });
      await page.reload();
      await page.waitForSelector('#svgTarget svg');
    });

    test('starts locked to landscape and offers to allow rotation', async ({ page }) => {
      expect(await page.evaluate(() => window.__orientationCalls)).toEqual([['lock', 'landscape']]);
      await openGroup(page, 'displayAnchor');
      await expect(page.locator('#screenRotationButton')).toBeVisible();
      expect(await rowLabel(page)).toBe('Allow rotation');
    });

    test('Allow rotation unlocks, and the row then offers to lock again', async ({ page }) => {
      await chooseFromGroup(page, 'displayAnchor', 'screenRotationButton');
      expect((await page.evaluate(() => window.__orientationCalls)).at(-1)).toEqual(['unlock']);

      await openGroup(page, 'displayAnchor');
      expect(await rowLabel(page)).toBe('Lock to landscape');
      await page.click('#screenRotationButton');
      expect((await page.evaluate(() => window.__orientationCalls)).at(-1)).toEqual([
        'lock',
        'landscape',
      ]);
    });

    test('the choice is remembered on the next launch', async ({ page }) => {
      await chooseFromGroup(page, 'displayAnchor', 'screenRotationButton');
      await page.reload();
      await page.waitForSelector('#svgTarget svg');
      expect(await page.evaluate(() => window.__orientationCalls)).toEqual([['unlock']]);
    });
  });
});
