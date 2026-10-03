// Shared helpers for the Groove Scribe browser tests.

// Navigate to a groove URL and wait until the sheet-music SVG has rendered.
export async function loadGroove(page, url) {
  await page.goto(url);
  await page.waitForSelector('#svgTarget svg', { timeout: 15000 });
}

// The rendered sheet-music SVG markup (abc2svg output).
export function getSvg(page) {
  return page.locator('#svgTarget').innerHTML();
}

// The MIDI data URL the app would play for the current grid state.
export function getMidi(page) {
  return page.evaluate(() => {
    const gw = window.myGrooveWriter;
    return gw.myGrooveUtils.create_MIDIURLFromGrooveData(gw.grooveDataFromClickableUI());
  });
}

// A snapshot of the groove data currently represented by the clickable grid.
export function grooveData(page) {
  return page.evaluate(() => {
    const gd = window.myGrooveWriter.grooveDataFromClickableUI();
    return {
      notesPerMeasure: gd.notesPerMeasure,
      timeDivision: gd.timeDivision,
      numberOfMeasures: gd.numberOfMeasures,
      numBeats: gd.numBeats,
      noteValue: gd.noteValue,
      showToms: gd.showToms,
      showStickings: gd.showStickings,
      tempo: gd.tempo,
      hhOn: gd.hh_array.filter(Boolean).length,
      snareOn: gd.snare_array.filter(Boolean).length,
      kickOn: gd.kick_array.filter(Boolean).length,
    };
  });
}

// ---- hamburger menu ---------------------------------------------------------
// Almost every action lives in the hamburger menu (top right). Items are not
// visible until it is open, so tests go through these helpers.

// Open the hamburger menu (no-op if it is already open).
export async function openMenu(page) {
  const open = await page.evaluate(() =>
    document.getElementById('hamburgerMenu').classList.contains('open')
  );
  if (!open) await page.click('#hamburgerButton');
}

// Open one of the menu's cascading groups (editAnchor, displayAnchor,
// shareExportAnchor, permutationAnchor, groovesAnchor, helpAnchor).
export async function openGroup(page, anchorId) {
  await openMenu(page);
  await page.click('#' + anchorId);
}

// Open a group and click one of the items in its submenu.
export async function chooseFromGroup(page, anchorId, itemId) {
  await openGroup(page, anchorId);
  await page.click('#' + itemId);
}

// Open the Groove Setup dialog from the menu.
export async function openGrooveSetup(page) {
  await openMenu(page);
  await page.click('#grooveSetupItem');
  await page.waitForSelector('#grooveSetupModal.open');
}
