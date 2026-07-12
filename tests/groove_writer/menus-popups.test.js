import { describe, it, expect, beforeEach, vi } from 'vitest';
import { newGrooveWriter, buildGridDOM } from '../helpers/loadGrooveWriter.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tests for the menu/popup handlers in js/groove_writer.js: the anchor openers
// (metronome/permutation/grooves/help/stickings/download), the metronome options
// popup, the permutation popup + option checkboxes, the help menu, and the time
// signature popup. Grid/note-click handlers (muteInstrument, noteLabelClick, etc.)
// are owned by a different suite and are intentionally out of scope here.
//
// --- Why the two shims below exist -----------------------------------------
// A few of these handlers (permutationPopupClick, timeSigPopupClose('ok'),
// changeDivision) cascade into the sheet-music render pipeline
// (updateSheetMusic -> generate_ABC -> renderABCtoSVG). That pipeline reads two
// kinds of "bare globals":
//   1. `constant_ABC_*` / `constant_OUR_MIDI_*` -- declared as top-level `var`s in
//      groove_utils.js. In production both files are classic <script> tags
//      sharing one global scope, so groove_writer.js can reference them directly.
//   2. `Abc` -- the abc2svg-1.js rendering engine, also a classic-script global.
// Under the vitest legacy-module transform, each file becomes its own ES module,
// so top-level `var`s no longer leak onto `globalThis` the way they do in a
// browser. Without shimming them, these code paths throw ReferenceError purely
// as an artifact of the test environment, not a real product bug. The same
// pattern is already established in tests/groove_utils/dom-and-highlight.test.js
// for `Abc`; we extend it here to the `constant_*` set so the real render path
// (not a mock) executes for the handlers that reach it.
const __here = path.dirname(fileURLToPath(import.meta.url));
const __grooveUtilsSrc = fs.readFileSync(path.resolve(__here, '../../js/groove_utils.js'), 'utf8');
const __constRe = /^var (constant_[A-Za-z0-9_]+) = (.+?);(?:\s*\/\/.*)?$/gm;
let __m;
while ((__m = __constRe.exec(__grooveUtilsSrc))) {
  try {
    globalThis[__m[1]] = new Function(`return (${__m[2]});`)();
  } catch (e) {
    // skip anything we can't safely eval; not needed by the paths under test
  }
}

let AbcCtor;
{
  const src = fs.readFileSync(path.resolve(__here, '../../js/abc2svg-1.js'), 'utf8');
  const factory = new Function(`${src}\n;return (typeof Abc !== 'undefined') ? Abc : undefined;`);
  AbcCtor = factory() || null;
}

let gw;

// Menu/popup DOM fixture, trimmed from js/index.html's actual ids/structure
// (read directly, not guessed) for every handler under test.
function buildMenuFixtures() {
  document.body.innerHTML += `
    <span class="metronomeButton" id="metronomeOff"></span>
    <span class="metronomeButton" id="metronome4ths"></span>
    <span class="metronomeButton" id="metronome8ths"></span>
    <span class="metronomeButton" id="metronome16ths"></span>
    <span class="metronomeButton Options" id="metronomeOptionsAnchor"></span>
    <ul id="metronomeOptionsContextMenu" class="list">
      <li class="metronomeOptionsContextMenuItem" id="metronomeOptionsContextMenuSolo"></li>
      <li class="metronomeOptionsContextMenuItem" id="metronomeOptionsContextMenuSpeedUp"></li>
      <li class="metronomeOptionsContextMenuItem" id="metronomeOptionsContextMenuCountIn"></li>
      <li class="metronomeOptionsContextMenuItem" id="metronomeOptionsContextMenuOffTheOne"></li>
    </ul>
    <ul id="metronomeOptionsOffsetClickContextMenu" class="list">
      <li class="metronomeOptionsOffsetClickContextMenuItem menuChecked" id="metronomeOptionsOffsetClickContextMenuOnThe1"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheE"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheAND"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheA"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheROTATE"></li>
    </ul>
    <ul id="metronomeOptionsOffsetClickForTripletsContextMenu" class="list">
      <li class="metronomeOptionsOffsetClickContextMenuItem menuChecked" id="metronomeOptionsOffsetClickContextMenuOnThe1Triplet"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheTI"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheTA"></li>
      <li class="metronomeOptionsOffsetClickContextMenuItem" id="metronomeOptionsOffsetClickContextMenuOnTheROTATE"></li>
    </ul>
    <div id="metronomeAutoSpeedupConfiguration">
      <input id="metronomeAutoSpeedupTempoIncreaseAmount" value="5">
      <span id="metronomeAutoSpeedupTempoIncreaseAmountOutput"></span>
      <input id="metronomeAutoSpeedupTempoIncreaseInterval" value="4">
      <span id="metronomeAutoSpeedupTempoIncreaseIntervalOutput"></span>
    </div>

    <span id="permutationAnchor"></span>
    <ul id="permutationContextMenu" class="list"></ul>
    <div id="PermutationOptions"></div>

    <span id="groovesAnchor"></span>
    <div id="grooveListWrapper"></div>

    <span id="helpAnchor"></span>
    <ul id="helpContextMenu" class="list"></ul>

    <span id="stickingsButton"></span>
    <ul id="stickingsContextMenu" class="list"></ul>

    <span id="downloadButton"></span>
    <ul id="downloadContextMenu" class="list"></ul>

    <div id="timeSigPopup">
      <select id="timeSigPopupTimeSigTop">
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4" selected>4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="7">7</option>
      </select>
      <select id="timeSigPopupTimeSigBottom">
        <option value="4" selected>4</option>
        <option value="8">8</option>
        <option value="16">16</option>
      </select>
    </div>
    <span id="timeSigLabel"></span>
  `;
}

// Elements required whenever a handler cascades into updateSheetMusic() /
// changeDivision() (ABCsource, svgTarget, diverr, measureContainer, plus the
// swing display/slider keyed by GrooveUtils' per-instance unique index).
function buildRenderPipelineFixtures() {
  const idx = gw.myGrooveUtils.grooveUtilsUniqueIndex;
  document.body.innerHTML +=
    '<textarea id="ABCsource"></textarea><div id="svgTarget"></div><div id="diverr"></div>' +
    '<div id="measureContainer"></div><input id="musicalInput">' +
    '<span id="swingOutput' + idx + '"></span><input id="swingInput' + idx + '" type="range">';
}

beforeEach(async () => {
  document.body.innerHTML = '';
  if (AbcCtor) globalThis.Abc = AbcCtor;
  gw = await newGrooveWriter();
  gw.refresh_ABC = vi.fn();
  gw.updateCurrentURL = vi.fn();
  buildMenuFixtures();
});

describe('anchor openers', () => {
  it('metronomeOptionsAnchorClick shows the metronome options context menu', () => {
    const menu = document.getElementById('metronomeOptionsContextMenu');
    expect(menu.style.display).toBe('');
    gw.metronomeOptionsAnchorClick({});
    expect(menu.style.display).toBe('block');
    // GrooveUtils tracks the currently-open menu so document click-away can close it.
    expect(gw.myGrooveUtils.visible_context_menu).toBe(menu);
  });

  it('permutationAnchorClick shows the permutation context menu in 4/4 time', () => {
    const menu = document.getElementById('permutationContextMenu');
    gw.permutationAnchorClick({});
    expect(menu.style.display).toBe('block');
  });

  it('permutationAnchorClick is a no-op outside 4/4 time (guard clause)', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();
    document.getElementById('timeSigPopupTimeSigTop').value = '3';
    document.getElementById('timeSigPopupTimeSigBottom').value = '4';
    gw.timeSigPopupClose('ok'); // now in 3/4 time; permutations only work in 4/4

    const menu = document.getElementById('permutationContextMenu');
    gw.permutationAnchorClick({});
    expect(menu.style.display).toBe(''); // never shown
  });

  it('groovesAnchorClick shows the grooves list', () => {
    const menu = document.getElementById('grooveListWrapper');
    gw.groovesAnchorClick({});
    expect(menu.style.display).toBe('block');
  });

  it('helpAnchorClick shows the help context menu', () => {
    const menu = document.getElementById('helpContextMenu');
    gw.helpAnchorClick({});
    expect(menu.style.display).toBe('block');
  });

  it('stickingsAnchorClick shows the stickings context menu', () => {
    const menu = document.getElementById('stickingsContextMenu');
    // the handler reads event.clientX/clientY to position the menu
    gw.stickingsAnchorClick({ clientX: 100, clientY: 100 });
    expect(menu.style.display).toBe('block');
  });

  it('DownloadAnchorClick shows the download context menu', () => {
    const menu = document.getElementById('downloadContextMenu');
    gw.DownloadAnchorClick({ clientX: 100, clientY: 100 });
    expect(menu.style.display).toBe('block');
  });
});

describe('metronome options menu', () => {
  it('metronomeOptionsMenuPopupClick("Solo") turns solo on, checks the menu item, and defaults the frequency to 4', () => {
    expect(gw.getMetronomeFrequency()).toBe(0);
    expect(gw.myGrooveUtils.getMetronomeSolo()).toBe(false);

    gw.metronomeOptionsMenuPopupClick('Solo');

    expect(gw.myGrooveUtils.getMetronomeSolo()).toBe(true);
    // Solo forces a frequency when starting from 0 (metronome off).
    expect(gw.getMetronomeFrequency()).toBe(4);
    expect(document.getElementById('metronomeOptionsContextMenuSolo').className).toContain('menuChecked');
    // metronomeOptionsMenuSetSelectedState() marks the anchor "selected" while solo is active.
    expect(document.getElementById('metronomeOptionsAnchor').className).toContain('selected');
  });

  it('metronomeOptionsMenuPopupClick("Solo") toggles back off on a second click', () => {
    gw.metronomeOptionsMenuPopupClick('Solo');
    gw.metronomeOptionsMenuPopupClick('Solo');
    expect(gw.myGrooveUtils.getMetronomeSolo()).toBe(false);
    expect(document.getElementById('metronomeOptionsContextMenuSolo').className).not.toContain('menuChecked');
  });

  it('metronomeOptionsMenuPopupClick("SpeedUp") shows the auto-speedup configuration and checks the menu item', () => {
    gw.metronomeOptionsMenuPopupClick('SpeedUp');
    expect(document.getElementById('metronomeAutoSpeedupConfiguration').style.display).toBe('block');
    expect(document.getElementById('metronomeOptionsContextMenuSpeedUp').className).toContain('menuChecked');
    expect(document.getElementById('metronomeOptionsAnchor').className).toContain('selected');
  });

  it('metronomeOptionsMenuPopupClick("SpeedUp") turns back off without reshowing the configurator', () => {
    gw.metronomeOptionsMenuPopupClick('SpeedUp');
    document.getElementById('metronomeAutoSpeedupConfiguration').style.display = 'none'; // simulate user closing it
    gw.metronomeOptionsMenuPopupClick('SpeedUp');
    expect(document.getElementById('metronomeOptionsContextMenuSpeedUp').className).not.toContain('menuChecked');
    // turning off does not re-open the popup
    expect(document.getElementById('metronomeAutoSpeedupConfiguration').style.display).toBe('none');
  });

  // BUG: root.myGrooveUtils.setMetronomeCountIn is never defined anywhere in
  // groove_utils.js (verified by grep across the source), yet
  // metronomeOptionsMenuPopupClick("CountIn") unconditionally calls it. Clicking
  // "Count it in" in the real app throws a TypeError instead of toggling the
  // count-in feature. This is a genuine product bug, not a test-harness artifact.
  it('metronomeOptionsMenuPopupClick("CountIn") throws because setMetronomeCountIn does not exist (documented bug)', () => {
    expect(gw.myGrooveUtils.setMetronomeCountIn).toBeUndefined();
    expect(() => gw.metronomeOptionsMenuPopupClick('CountIn')).toThrow(TypeError);
  });

  it('metronomeOptionsMenuPopupClick("OffTheOne") opens the non-triplet offset submenu by default', () => {
    gw.metronomeOptionsMenuPopupClick('OffTheOne');
    expect(document.getElementById('metronomeOptionsOffsetClickContextMenu').style.display).toBe('block');
    expect(document.getElementById('metronomeOptionsOffsetClickForTripletsContextMenu').style.display).toBe('');
  });

  it('metronomeOptionsMenuPopupClick("OffTheOne") opens the triplets offset submenu when the division is a triplet division', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();
    gw.changeDivision(12); // 1/8 triplets
    expect(gw.notesPerMeasure()).toBe(12);

    gw.metronomeOptionsMenuPopupClick('OffTheOne');

    expect(document.getElementById('metronomeOptionsOffsetClickForTripletsContextMenu').style.display).toBe('block');
    expect(document.getElementById('metronomeOptionsOffsetClickContextMenu').style.display).toBe('');
  });

  it('metronomeOptionsMenuPopupClick("Dropper") is a documented no-op branch', () => {
    const before = document.getElementById('metronomeOptionsAnchor').className;
    gw.metronomeOptionsMenuPopupClick('Dropper');
    // "Dropper" case body is empty (just `break;`); only the trailing
    // metronomeOptionsMenuSetSelectedState() call runs, and default state leaves
    // the anchor unselected, so nothing observable changes.
    expect(document.getElementById('metronomeOptionsAnchor').className).toBe(before);
  });

  it('metronomeOptionsMenuPopupClick with an unrecognized option logs and does not throw', () => {
    expect(() => gw.metronomeOptionsMenuPopupClick('NotARealOption')).not.toThrow();
  });

  it('metronomeOptionsMenuOffsetClickPopupClick sets the offset, checks the new menu item, and unchecks the old one', () => {
    gw.metronomeOptionsMenuOffsetClickPopupClick('E');

    expect(gw.myGrooveUtils.getMetronomeOffsetClickStart()).toBe('E');
    expect(document.getElementById('metronomeOptionsOffsetClickContextMenuOnTheE').className).toContain('menuChecked');
    expect(document.getElementById('metronomeOptionsOffsetClickContextMenuOnThe1').className).not.toContain('menuChecked');
    // non-default offset (!= "1") marks the parent "Offset click" menu item checked too
    expect(document.getElementById('metronomeOptionsContextMenuOffTheOne').className).toContain('menuChecked');
  });

  it('metronomeOptionsMenuOffsetClickPopupClick("1") leaves the parent menu item unchecked (default state)', () => {
    gw.metronomeOptionsMenuOffsetClickPopupClick('E'); // move off default first
    gw.metronomeOptionsMenuOffsetClickPopupClick('1'); // back to default
    expect(document.getElementById('metronomeOptionsContextMenuOffTheOne').className).not.toContain('menuChecked');
  });

  it('resetMetronomeOptionsMenuOffsetClick resets the offset back to "1"', () => {
    gw.metronomeOptionsMenuOffsetClickPopupClick('E');
    gw.resetMetronomeOptionsMenuOffsetClick();
    expect(gw.myGrooveUtils.getMetronomeOffsetClickStart()).toBe('1');
    expect(document.getElementById('metronomeOptionsContextMenuOffTheOne').className).not.toContain('menuChecked');
  });
});

describe('permutation menu', () => {
  it('permutationPopupClick("kick_16ths") selects the anchor and populates PermutationOptions', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();

    gw.permutationPopupClick('kick_16ths');

    expect(document.getElementById('permutationAnchor').className).toContain('buttonSelected');
    expect(document.getElementById('PermutationOptions').className).toContain('displayed');
    expect(document.getElementById('PermutationOptions').innerHTML.length).toBeGreaterThan(0);
    // updateSheetMusic() ran to completion and populated the hidden ABC textarea.
    expect(document.getElementById('ABCsource').value.length).toBeGreaterThan(0);
  });

  it('permutationPopupClick("snare_16ths") selects the anchor and populates PermutationOptions', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();

    gw.permutationPopupClick('snare_16ths');

    expect(document.getElementById('permutationAnchor').className).toContain('buttonSelected');
    expect(document.getElementById('PermutationOptions').className).toContain('displayed');
  });

  it('permutationPopupClick("none") is a no-op when the permutation is already "none" (early return)', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();

    gw.permutationPopupClick('none');

    // The function returns before touching the DOM or calling updateSheetMusic().
    expect(document.getElementById('PermutationOptions').innerHTML).toBe('');
    expect(document.getElementById('ABCsource').value).toBe('');
  });

  it('permutationPopupClick("none") fully unwinds a previously-selected permutation', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();

    gw.permutationPopupClick('kick_16ths');
    expect(document.getElementById('permutationAnchor').className).toContain('buttonSelected');

    gw.permutationPopupClick('none');

    expect(document.getElementById('permutationAnchor').className).not.toContain('buttonSelected');
    expect(document.getElementById('PermutationOptions').className).not.toContain('displayed');
    // HTMLforPermutationOptions() returns "" once class_permutation_type is "none".
    expect(document.getElementById('PermutationOptions').innerHTML).toBe('');
  });

  it('permutationOptionClick toggles all of its sub-option checkboxes to match and calls refresh_ABC', () => {
    document.body.innerHTML += `
      <input type="checkbox" id="PermuationOptionsSingles">
      <input type="checkbox" id="PermuationOptionsSingles_sub1" checked>
      <input type="checkbox" id="PermuationOptionsSingles_sub2" checked>
    `;
    const mainCheckbox = document.getElementById('PermuationOptionsSingles');
    mainCheckbox.checked = false; // simulate the click having just unchecked it

    gw.permutationOptionClick({ target: mainCheckbox });

    expect(document.getElementById('PermuationOptionsSingles_sub1').checked).toBe(false);
    expect(document.getElementById('PermuationOptionsSingles_sub2').checked).toBe(false);
    expect(gw.refresh_ABC).toHaveBeenCalledTimes(1);
  });

  it('permutationSubOptionClick turns its main option on when checked, and calls refresh_ABC', () => {
    document.body.innerHTML += `
      <input type="checkbox" id="PermuationOptionsSingles">
      <input type="checkbox" id="PermuationOptionsSingles_sub1" checked>
    `;
    const subCheckbox = document.getElementById('PermuationOptionsSingles_sub1');

    gw.permutationSubOptionClick({ target: subCheckbox });

    expect(document.getElementById('PermuationOptionsSingles').checked).toBe(true);
    expect(gw.refresh_ABC).toHaveBeenCalledTimes(1);
  });

  it('permutationSubOptionClick does not touch the main option when unchecking a sub-option', () => {
    document.body.innerHTML += `
      <input type="checkbox" id="PermuationOptionsSingles" checked>
      <input type="checkbox" id="PermuationOptionsSingles_sub1">
    `;
    const subCheckbox = document.getElementById('PermuationOptionsSingles_sub1');
    subCheckbox.checked = false;

    gw.permutationSubOptionClick({ target: subCheckbox });

    // source only forces the main option ON; it never turns it off from a sub-option
    expect(document.getElementById('PermuationOptionsSingles').checked).toBe(true);
  });
});

describe('help menu', () => {
  it('helpMenuPopupClick("help") opens gscribe_help.html in a new tab and focuses it', () => {
    const win = { focus: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win);

    gw.helpMenuPopupClick('help');

    expect(openSpy).toHaveBeenCalledWith('./gscribe_help.html', '_blank');
    expect(win.focus).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  it('helpMenuPopupClick("about") opens gscribe_about.html in a new tab and focuses it', () => {
    const win = { focus: vi.fn() };
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(win);

    gw.helpMenuPopupClick('about');

    expect(openSpy).toHaveBeenCalledWith('./gscribe_about.html', '_blank');
    expect(win.focus).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  it('helpMenuPopupClick("undo"/"redo") delegate to undoCommand/redoCommand', () => {
    gw.undoCommand = vi.fn();
    gw.redoCommand = vi.fn();

    gw.helpMenuPopupClick('undo');
    gw.helpMenuPopupClick('redo');

    expect(gw.undoCommand).toHaveBeenCalledTimes(1);
    expect(gw.redoCommand).toHaveBeenCalledTimes(1);
  });

  it('helpMenuPopupClick with an unrecognized type logs and does not throw', () => {
    expect(() => gw.helpMenuPopupClick('bogus')).not.toThrow();
  });
});

describe('time signature popup', () => {
  it('timeSigPopupOpen shows the popup', () => {
    const popup = document.getElementById('timeSigPopup');
    expect(popup.style.display).toBe('');
    gw.timeSigPopupOpen();
    expect(popup.style.display).toBe('block');
  });

  it('timeSigPopupClose("cancel") hides the popup without changing the time signature', () => {
    gw.timeSigPopupOpen();
    gw.timeSigPopupClose('cancel');
    expect(document.getElementById('timeSigPopup').style.display).toBe('none');
    // label reflects the still-default 4/4 (setTimeSigLabel reads the same class vars)
    gw.setTimeSigLabel();
    expect(document.getElementById('timeSigLabel').innerHTML).toBe('<sup>4</sup>/<sub>4</sub>');
  });

  it('timeSigPopupClose("ok") applies the new time signature, relayouts, and updates the label', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();
    document.getElementById('timeSigPopupTimeSigTop').value = '3';
    document.getElementById('timeSigPopupTimeSigBottom').value = '4';

    gw.timeSigPopupClose('ok');

    // changeDivisionWithNotes() calls root.setTimeSigLabel() as part of the relayout.
    expect(document.getElementById('timeSigLabel').innerHTML).toBe('<sup>3</sup>/<sub>4</sub>');
  });

  it('setTimeSigLabel renders the current time signature as <sup>top</sup>/<sub>bottom</sub>', () => {
    gw.setTimeSigLabel();
    expect(document.getElementById('timeSigLabel').innerHTML).toBe('<sup>4</sup>/<sub>4</sub>');
  });

  it('setTimeDivisionSelectionOnOrOff leaves 8ths/triplets enabled in the default 4/4 time', () => {
    document.body.innerHTML +=
      '<span id="subdivision_8ths"></span><span id="subdivision_12ths"></span>' +
      '<span id="subdivision_24ths"></span><span id="subdivision_48ths"></span>';

    gw.setTimeDivisionSelectionOnOrOff();

    expect(document.getElementById('subdivision_8ths').className).not.toContain('disabled');
    expect(document.getElementById('subdivision_12ths').className).not.toContain('disabled');
    expect(document.getElementById('subdivision_24ths').className).not.toContain('disabled');
    expect(document.getElementById('subdivision_48ths').className).not.toContain('disabled');
  });

  it('setTimeDivisionSelectionOnOrOff disables triplet subdivisions outside x/4 time', () => {
    buildGridDOM(gw, 1);
    buildRenderPipelineFixtures();
    document.body.innerHTML +=
      '<span id="subdivision_8ths"></span><span id="subdivision_12ths"></span>' +
      '<span id="subdivision_24ths"></span><span id="subdivision_48ths"></span>';
    document.getElementById('timeSigPopupTimeSigTop').value = '6';
    document.getElementById('timeSigPopupTimeSigBottom').value = '8';

    gw.timeSigPopupClose('ok'); // 6/8 time; changeDivisionWithNotes calls setTimeDivisionSelectionOnOrOff internally

    expect(document.getElementById('subdivision_12ths').className).toContain('disabled');
    expect(document.getElementById('subdivision_24ths').className).toContain('disabled');
    expect(document.getElementById('subdivision_48ths').className).toContain('disabled');
    // 8ths are only disabled for an odd combination like 9/16; 6/8 keeps them enabled.
    expect(document.getElementById('subdivision_8ths').className).not.toContain('disabled');
  });

  it('setTimeDivisionSelectionOnOrOff warns but does not throw when the subdivision elements are missing', () => {
    // addOrRemoveKeywordFromClassById() logs a console warning and continues when
    // getElementById() returns null, rather than throwing -- verified directly since
    // this fixture intentionally omits the subdivision_* elements.
    expect(() => gw.setTimeDivisionSelectionOnOrOff()).not.toThrow();
  });
});
