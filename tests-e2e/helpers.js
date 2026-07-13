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
