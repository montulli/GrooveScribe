import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newGrooveWriter, buildGridDOM } from '../helpers/loadGrooveWriter.js';

// --- Cross-module global shims -------------------------------------------------
//
// groove_writer.js's source references several bare `constant_ABC_*` /
// `constant_OUR_MIDI_*` identifiers that are declared as top-level `var`s in
// groove_utils.js. In the shipped app all scripts are classic (non-module)
// <script> tags sharing one global scope, so those vars are visible everywhere.
// Under Vitest's ES-module transform (see vitest.config.js) each file gets its
// own module scope, so the *value* never reaches the global object and a bare
// reference throws ReferenceError the first time one of these code paths runs
// (e.g. reading a sticking's ABC state, or playing a note on click). This is a
// test-environment gap, not a product bug, so we shim the handful of constants
// these tests actually exercise directly onto globalThis (values copied
// verbatim from js/groove_utils.js).
globalThis.constant_ABC_STICK_R = '"R"x';
globalThis.constant_ABC_STICK_L = '"L"x';
globalThis.constant_ABC_STICK_BOTH = '"R/L"x';
globalThis.constant_ABC_STICK_COUNT = '"count"x';
globalThis.constant_ABC_STICK_OFF = '""x';
globalThis.constant_ABC_KI_Normal = 'F';
globalThis.constant_ABC_KI_SandK = '[F^d,]';
globalThis.constant_ABC_KI_Splash = '^d,';
globalThis.constant_OUR_MIDI_KICK_NORMAL = 36;
globalThis.constant_OUR_MIDI_VELOCITY_NORMAL = 100;
// A real click also tries to play a sound through the MIDI.js runtime, which
// doesn't exist under jsdom. An empty MIDI global (no .WebAudio/.AudioTag)
// makes play_single_note_for_note_setting() a no-op, same as it would be in a
// real browser before the MIDI soundfont finishes loading.
if (!globalThis.MIDI) globalThis.MIDI = {};

// jsdom does not implement scrollIntoView; addMeasureButtonClick calls it on
// the "add measure" button after re-laying out the grid.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// Build the extra chrome that changeDivisionWithNotes/updateSheetMusic reach
// into directly via document.getElementById(...).innerHTML/.value with no null
// guard (confirmed by probing: missing any one of these throws). ids taken
// from index.html: #measureContainer (the grid re-layout target),
// #PermutationOptions, #ABCsource, #timeSigLabel, plus a per-instance
// #swingOutput<N> element that GrooveUtils.swingEnabled() writes to.
function buildMeasureFixture(gw, measures = 1) {
  const container = document.createElement('div');
  container.id = 'measureContainer';
  let html = '';
  for (let m = 1; m <= measures; m++) {
    html += gw.HTMLforStaffContainer(m, (m - 1) * gw.notesPerMeasure());
  }
  container.innerHTML = html;
  document.body.appendChild(container);

  const chrome = document.createElement('div');
  chrome.innerHTML =
    '<div id="PermutationOptions"></div>' +
    '<textarea id="ABCsource"></textarea>' +
    '<div id="timeSigLabel"></div>' +
    '<input id="tuneTitle" value="">' +
    '<input id="tuneAuthor" value="">' +
    '<input id="tuneComments" value="">' +
    '<input id="showLegend" type="checkbox">' +
    '<div id="swingOutput' + gw.myGrooveUtils.grooveUtilsUniqueIndex + '"></div>';
  document.body.appendChild(chrome);

  return container;
}

let gw;

describe('addMeasureButtonClick / closeMeasureButtonClick', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    buildMeasureFixture(gw, 1);
    gw.updateCurrentURL = vi.fn();
    gw.displayNewSVG = vi.fn();
  });

  it('adds a measure and grows the grid', () => {
    expect(gw.numberOfMeasures()).toBe(1);

    gw.addMeasureButtonClick({});

    expect(gw.numberOfMeasures()).toBe(2);
    // addMeasureButtonClick rewrites #measureContainer's innerHTML (via
    // changeDivisionWithNotes) with one .staff-container per measure.
    expect(document.getElementById('measureContainer').querySelectorAll('.staff-container').length).toBe(2);

    const gd = gw.grooveDataFromClickableUI();
    expect(gd.numberOfMeasures).toBe(2);
    expect(gd.hh_array.length).toBe(2 * gw.notesPerMeasure()); // 32 notes for 2 measures of 16ths
  });

  it('copies the last measure\'s notes into the new measure, and preserves existing notes', () => {
    // Turn kick on at note 0 of measure 1 (off -> "normal" on the first click).
    gw.noteLeftClick(null, 'kick', 0);
    expect(gw.grooveDataFromClickableUI().kick_array[0]).toBe('F'); // constant_ABC_KI_Normal

    gw.addMeasureButtonClick({});

    const gd = gw.grooveDataFromClickableUI();
    // measure 1's note is preserved...
    expect(gd.kick_array[0]).toBe('F');
    // ...and the new measure (indices 16-31) starts as a copy of the last
    // measure that existed before the add, per the "copy the notes from the
    // last measure to the new measure" comment on addMeasureButtonClick.
    expect(gd.kick_array[gw.notesPerMeasure()]).toBe('F');
    // a note that was never turned on stays off in both measures.
    expect(gd.kick_array[1]).toBe(false);
    expect(gd.kick_array[gw.notesPerMeasure() + 1]).toBe(false);
  });

  it('removes a measure', () => {
    gw.addMeasureButtonClick({}); // 1 -> 2, so there's something to remove
    expect(gw.numberOfMeasures()).toBe(2);

    gw.closeMeasureButtonClick(2); // 1-indexed: remove the 2nd measure

    expect(gw.numberOfMeasures()).toBe(1);
    expect(document.getElementById('measureContainer').querySelectorAll('.staff-container').length).toBe(1);
    expect(gw.grooveDataFromClickableUI().hh_array.length).toBe(gw.notesPerMeasure());
  });

  // BUG (observed, not asserting it's desirable): closeMeasureButtonClick has no
  // lower-bound guard. The "remove measure" button is only *rendered* when
  // numberOfMeasures() > 1 (see HTMLforStaffContainer), so normal UI use can't
  // reach this path -- but the function itself will happily decrement a
  // 1-measure groove to 0 measures. changeDivisionWithNotes then rewrites
  // #measureContainer to an empty string (the "for measure = 1; measure <= 0"
  // loop body never runs), and the very next updateSheetMusic() call throws
  // because it reads notes from DOM ids (hh0, kick0, ...) that no longer exist.
  it('has no lower-bound guard: closing the last measure corrupts state and throws on the next redraw', () => {
    expect(gw.numberOfMeasures()).toBe(1);

    expect(() => gw.closeMeasureButtonClick(1)).toThrow();

    // class_number_of_measures was already decremented to 0 before the throw.
    expect(gw.numberOfMeasures()).toBe(0);
  });
});

describe('showHideToms', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    buildGridDOM(gw, 1);
    document.body.innerHTML += '<span id="showHideTomsButton"></span>';
    gw.updateCurrentURL = vi.fn();
    gw.displayNewSVG = vi.fn();
  });

  it('is hidden by default', () => {
    expect(gw.grooveDataFromClickableUI().showToms).toBe(false);
  });

  it('toggles visibility when called without force, and updates grooveDataFromClickableUI().showToms', () => {
    gw.showHideToms(false, false, true); // dontRefreshScreen=true, avoid the render cascade
    expect(gw.grooveDataFromClickableUI().showToms).toBe(true);
    expect(document.querySelector('.toms-container').style.visibility).toBe('visible');

    gw.showHideToms(false, false, true);
    expect(gw.grooveDataFromClickableUI().showToms).toBe(false);
    expect(document.querySelector('.toms-container').style.visibility).toBe('hidden');
  });

  it('forces show/hide when force=true', () => {
    gw.showHideToms(true, true, true);
    expect(gw.grooveDataFromClickableUI().showToms).toBe(true);

    gw.showHideToms(true, false, true);
    expect(gw.grooveDataFromClickableUI().showToms).toBe(false);
  });

  // BUG (observed): showHideCSS_ClassVisibility (the helper showHideToms uses
  // for the ".toms-container"/".tom-label" classes) has no `return` statement,
  // so it always yields `undefined`. showHideToms treats that as falsy, so it
  // always takes the "hide" branch when updating the button's class list --
  // the button's "ClickToHide" class is never added, regardless of whether
  // toms are actually shown or hidden. This does not affect the toms rows
  // themselves (their visibility is set directly inside the loop before the
  // missing return), only the button's own CSS-class bookkeeping.
  it('never adds "ClickToHide" to showHideTomsButton, even when toms are shown (missing return in showHideCSS_ClassVisibility)', () => {
    const btn = document.getElementById('showHideTomsButton');
    expect(btn.className).not.toContain('ClickToHide');

    gw.showHideToms(true, true, true); // force show
    expect(gw.grooveDataFromClickableUI().showToms).toBe(true); // toms are genuinely shown...
    expect(btn.className).not.toContain('ClickToHide'); // ...but the button class never updates
  });
});

describe('stickingsShowHide / stickingsShowHideToggle', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    buildGridDOM(gw, 1);
    // stickingsShowHideToggle calls stickingsShowHide with dontRefreshScreen=false,
    // which runs the full updateSheetMusic() pipeline -- needs #ABCsource.
    document.body.innerHTML += '<span id="stickingsButton"></span><textarea id="ABCsource"></textarea>';
    gw.updateCurrentURL = vi.fn();
    gw.displayNewSVG = vi.fn();
  });

  it('is hidden by default', () => {
    expect(gw.grooveDataFromClickableUI().showStickings).toBe(false);
    expect(document.querySelector('.stickings-container').style.display).not.toBe('block');
  });

  it('stickingsShowHide forces show/hide and reflects in grooveDataFromClickableUI().showStickings', () => {
    gw.stickingsShowHide(true, true, true);
    expect(gw.grooveDataFromClickableUI().showStickings).toBe(true);
    expect(document.querySelector('.stickings-container').style.display).toBe('block');

    gw.stickingsShowHide(true, false, true);
    expect(gw.grooveDataFromClickableUI().showStickings).toBe(false);
  });

  it('stickingsShowHideToggle flips the current state each call', () => {
    expect(gw.grooveDataFromClickableUI().showStickings).toBe(false);

    gw.stickingsShowHideToggle();
    expect(gw.grooveDataFromClickableUI().showStickings).toBe(true);

    gw.stickingsShowHideToggle();
    expect(gw.grooveDataFromClickableUI().showStickings).toBe(false);
  });

  // Unlike showHideToms's button (see the sibling describe block above),
  // stickingsShowHide's helper (showHideCSS_ClassDisplay) DOES return its
  // computed on/off state, so the button's class list tracks reality here.
  it('adds "ClickToHide" to stickingsButton when shown, removes it when hidden', () => {
    const btn = document.getElementById('stickingsButton');

    gw.stickingsShowHide(true, true, true);
    expect(btn.className).toContain('ClickToHide');

    gw.stickingsShowHide(true, false, true);
    expect(btn.className).not.toContain('ClickToHide');
  });
});

describe('stickingsReverseRL', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    buildGridDOM(gw, 1);
    // noteLeftClick always runs the full updateSheetMusic() pipeline -- needs #ABCsource.
    document.body.innerHTML += '<textarea id="ABCsource"></textarea>';
    gw.updateCurrentURL = vi.fn();
    gw.displayNewSVG = vi.fn();
    // grooveDataFromClickableUI only populates sticking_array while stickings
    // are visible (isStickingsVisible()), so show them first.
    gw.stickingsShowHide(true, true, true);
  });

  it('swaps R for L and L for R, leaving other states untouched', () => {
    // sticking_rotate_state cycles off -> right -> left -> both -> count -> off
    // on each left-click, so one click sets "right" and two clicks set "left".
    gw.noteLeftClick(null, 'sticking', 0); // -> R
    gw.noteLeftClick(null, 'sticking', 1); // -> R
    gw.noteLeftClick(null, 'sticking', 1); // -> L
    gw.noteLeftClick(null, 'sticking', 2); // -> R
    gw.noteLeftClick(null, 'sticking', 2); // -> R
    gw.noteLeftClick(null, 'sticking', 2); // -> both (unaffected by reverse)

    let gd = gw.grooveDataFromClickableUI();
    expect(gd.sticking_array[0]).toBe('"R"x');
    expect(gd.sticking_array[1]).toBe('"L"x');
    expect(gd.sticking_array[2]).toBe('"R/L"x');

    gw.stickingsReverseRL();

    gd = gw.grooveDataFromClickableUI();
    expect(gd.sticking_array[0]).toBe('"L"x'); // R -> L
    expect(gd.sticking_array[1]).toBe('"R"x'); // L -> R
    expect(gd.sticking_array[2]).toBe('"R/L"x'); // both is untouched by the reverse
  });
});

describe('refresh_ABC', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    gw = await newGrooveWriter();
    buildGridDOM(gw, 1);
    document.body.innerHTML += '<textarea id="ABCsource"></textarea>';
    gw.updateCurrentURL = vi.fn();
    gw.displayNewSVG = vi.fn();
  });

  it('regenerates the ABC notation into #ABCsource and re-renders via displayNewSVG', () => {
    expect(document.getElementById('ABCsource').value).toBe('');

    gw.refresh_ABC();

    const abc = document.getElementById('ABCsource').value;
    expect(abc).toContain('%abc'); // abc2svg header marker
    expect(abc).toContain('X:6'); // tune-number boilerplate emitted by GrooveUtils
    expect(gw.displayNewSVG).toHaveBeenCalledTimes(1);
  });
});

describe('ShowHideABCResults', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ABC_Results"></div>';
  });

  it('toggles the ABC results panel between "block" and "none"', async () => {
    gw = await newGrooveWriter();
    const panel = document.getElementById('ABC_Results');
    expect(panel.style.display).toBe(''); // no inline style initially

    // Anything other than "block" is treated as hidden, so the first call shows it.
    const ret1 = gw.ShowHideABCResults();
    expect(panel.style.display).toBe('block');
    expect(ret1).toBe(false); // always returns false ("don't follow the link")

    gw.ShowHideABCResults();
    expect(panel.style.display).toBe('none');

    gw.ShowHideABCResults();
    expect(panel.style.display).toBe('block');
  });
});
