import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression coverage for the DOM/SVG-manipulation layer of groove_utils.js:
// context menus, on-screen detection, ABC/SVG note highlighting, MIDI
// player scaffolding (setGrooveData/midiNoteHasChanged/metronome/expand-
// retract/AddMidiPlayerToPage/loadFullScreenGrooveScribe), and (optionally)
// the real abc2svg render path.
//
// All ids below are suffixed with the per-instance `gu.grooveUtilsUniqueIndex`,
// matching the pattern used throughout groove_utils.js and the rest of this
// test suite (see tests/groove_utils/tempo-swing.test.js).

describe('GrooveUtils context menu handling', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.onclick = null;
  });

  describe('showContextMenu / hideContextMenu', () => {
    it('makes the menu visible and records it as the visible_context_menu', () => {
      document.body.innerHTML = '<div id="ctxMenu" style="display:none;"></div>';
      const menu = document.getElementById('ctxMenu');

      gu.showContextMenu(menu);

      expect(menu.style.display).toBe('block');
      expect(gu.visible_context_menu).toBe(menu);
    });

    it('hideContextMenu hides the menu, resets the document cursor, and clears visible_context_menu', () => {
      document.body.innerHTML = '<div id="ctxMenu" style="display:none;"></div>';
      const menu = document.getElementById('ctxMenu');

      gu.showContextMenu(menu);
      gu.hideContextMenu(menu);

      expect(menu.style.display).toBe('none');
      expect(gu.visible_context_menu).toBe(false);
      // hideContextMenu does `document.onclick = false;`, but the onclick IDL
      // attribute is a [LegacyTreatNonObjectAsNull] EventHandler: assigning any
      // non-callable value (including `false`) coerces the stored value to
      // null, so the observable result is null, not false.
      expect(document.onclick).toBeNull();
      expect(document.body.style.cursor).toBe('auto');
    });

    it('closes a previously visible menu before showing a new one', () => {
      document.body.innerHTML =
        '<div id="menuA" style="display:none;"></div><div id="menuB" style="display:none;"></div>';
      const menuA = document.getElementById('menuA');
      const menuB = document.getElementById('menuB');

      gu.showContextMenu(menuA);
      expect(menuA.style.display).toBe('block');

      gu.showContextMenu(menuB);

      expect(menuA.style.display).toBe('none'); // closed by the second call
      expect(menuB.style.display).toBe('block');
      expect(gu.visible_context_menu).toBe(menuB);
    });

    it('repositions the menu when it would overflow the bottom of the (jsdom) viewport', () => {
      // jsdom leaves document.documentElement.clientHeight at 0, so any menu
      // with offsetTop + clientHeight > 0 is considered "off the bottom" and
      // gets repositioned to clientHeight - menuClientHeight (here, -200px).
      document.body.innerHTML = '<div id="menuC" style="display:none;"></div>';
      const menu = document.getElementById('menuC');
      Object.defineProperty(menu, 'offsetTop', { value: 700, configurable: true });
      Object.defineProperty(menu, 'clientHeight', { value: 200, configurable: true });

      gu.showContextMenu(menu);

      expect(menu.style.top).toBe('-200px');
    });

    it('wires up document.onclick after a 100ms delay, making a document click close the menu', () => {
      vi.useFakeTimers();
      document.body.innerHTML = '<div id="ctxMenu" style="display:none;"></div>';
      const menu = document.getElementById('ctxMenu');

      gu.showContextMenu(menu);
      // the onclick handler is not installed synchronously (that would close
      // the menu immediately, using the same click that opened it).
      expect(document.onclick).toBeNull();

      vi.advanceTimersByTime(100);

      expect(typeof document.onclick).toBe('function');
      expect(document.body.style.cursor).toBe('pointer');

      // Simulate the next click landing anywhere in the document.
      document.onclick({});

      expect(menu.style.display).toBe('none');
      expect(gu.visible_context_menu).toBe(false);
    });
  });

  describe('documentOnClickHanderCloseContextMenu', () => {
    it('closes the currently visible context menu', () => {
      document.body.innerHTML = '<div id="ctxMenu2" style="display:none;"></div>';
      const menu = document.getElementById('ctxMenu2');
      gu.showContextMenu(menu);

      gu.documentOnClickHanderCloseContextMenu({});

      expect(menu.style.display).toBe('none');
      expect(gu.visible_context_menu).toBe(false);
    });

    it('is a no-op when no context menu is currently visible', () => {
      // Fresh instance: visible_context_menu defaults to false.
      expect(() => gu.documentOnClickHanderCloseContextMenu({})).not.toThrow();
      expect(gu.visible_context_menu).toBe(false);
    });
  });
});

describe('GrooveUtils.isElementOnScreen', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  it("returns false for an element with jsdom's default (all-zero) bounding rect", () => {
    // jsdom's getBoundingClientRect() always returns zeros, and the function
    // requires rect.top >= 80, so a real, un-mocked element is never "on screen".
    document.body.innerHTML = '<div id="el"></div>';
    const el = document.getElementById('el');
    expect(gu.isElementOnScreen(el)).toBe(false);
  });

  it("returns true when the element's rect fits within the window bounds", () => {
    document.body.innerHTML = '<div id="el"></div>';
    const el = document.getElementById('el');
    el.getBoundingClientRect = () => ({
      top: 100,
      left: 10,
      bottom: 200,
      right: 300,
      width: 290,
      height: 100,
    });
    expect(gu.isElementOnScreen(el)).toBe(true);
  });

  it('returns false when the rect top is above the 80px guard band', () => {
    document.body.innerHTML = '<div id="el"></div>';
    const el = document.getElementById('el');
    el.getBoundingClientRect = () => ({
      top: 79,
      left: 10,
      bottom: 200,
      right: 300,
      width: 290,
      height: 100,
    });
    expect(gu.isElementOnScreen(el)).toBe(false);
  });
});

describe('GrooveUtils ABC/SVG note highlighting', () => {
  let gu;
  let idx;
  beforeEach(async () => {
    gu = await newGrooveUtils();
    idx = gu.grooveUtilsUniqueIndex;
  });

  describe('highlightNoteInABCSVGByIndex / clearHighlightNoteInABCSVG', () => {
    it('adds " highlighted" to the class of the matching note element(s) and tracks the index', () => {
      document.body.innerHTML =
        `<div id="abcNoteNum_${idx}_0" class="note"></div>` +
        `<div id="abcNoteNum_${idx}_1" class="note"></div>`;

      gu.highlightNoteInABCSVGByIndex(0);

      expect(document.getElementById(`abcNoteNum_${idx}_0`).getAttribute('class')).toBe(
        'note highlighted'
      );
      expect(document.getElementById(`abcNoteNum_${idx}_1`).getAttribute('class')).toBe('note');
      expect(gu.abcNoteNumCurrentlyHighlighted).toBe(0);
    });

    it('clears the previous highlight before applying a new one', () => {
      document.body.innerHTML =
        `<div id="abcNoteNum_${idx}_0" class="note"></div>` +
        `<div id="abcNoteNum_${idx}_1" class="note"></div>`;

      gu.highlightNoteInABCSVGByIndex(0);
      gu.highlightNoteInABCSVGByIndex(1);

      expect(document.getElementById(`abcNoteNum_${idx}_0`).getAttribute('class')).toBe('note');
      expect(document.getElementById(`abcNoteNum_${idx}_1`).getAttribute('class')).toBe(
        'note highlighted'
      );
      expect(gu.abcNoteNumCurrentlyHighlighted).toBe(1);
    });

    it('clearHighlightNoteInABCSVG removes the "highlighted" class and resets the index to -1', () => {
      document.body.innerHTML = `<div id="abcNoteNum_${idx}_0" class="note"></div>`;
      gu.highlightNoteInABCSVGByIndex(0);

      gu.clearHighlightNoteInABCSVG();

      expect(document.getElementById(`abcNoteNum_${idx}_0`).getAttribute('class')).toBe('note');
      expect(gu.abcNoteNumCurrentlyHighlighted).toBe(-1);
    });

    it('clearHighlightNoteInABCSVG is a no-op when nothing is currently highlighted', () => {
      document.body.innerHTML = `<div id="abcNoteNum_${idx}_0" class="note highlighted"></div>`;
      gu.abcNoteNumCurrentlyHighlighted = -1; // fresh-instance default

      gu.clearHighlightNoteInABCSVG();

      // untouched, because the guard `if (root.abcNoteNumCurrentlyHighlighted > -1)` short-circuits.
      expect(document.getElementById(`abcNoteNum_${idx}_0`).getAttribute('class')).toBe(
        'note highlighted'
      );
    });

    describe('debugMode auto-scroll behavior', () => {
      it('calls scrollIntoView({block:"start"}) when the currently-highlighted note is index 0 and off-screen', () => {
        // jsdom does not implement Element.prototype.scrollIntoView at all,
        // so we install a spy to observe the call (calling the real,
        // un-mocked method would throw "... .scrollIntoView is not a
        // function" -- that failure mode is covered in the next test).
        document.body.innerHTML = `<div id="abcNoteNum_${idx}_0" class="note highlighted"></div>`;
        const el = document.getElementById(`abcNoteNum_${idx}_0`);
        const scrollSpy = vi.fn();
        el.scrollIntoView = scrollSpy;
        gu.debugMode = true;
        gu.abcNoteNumCurrentlyHighlighted = 0;

        gu.clearHighlightNoteInABCSVG();

        expect(scrollSpy).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
      });

      it('calls scrollIntoView({block:"end"}) when the currently-highlighted note index is non-zero and off-screen', () => {
        document.body.innerHTML = `<div id="abcNoteNum_${idx}_3" class="note highlighted"></div>`;
        const el = document.getElementById(`abcNoteNum_${idx}_3`);
        const scrollSpy = vi.fn();
        el.scrollIntoView = scrollSpy;
        gu.debugMode = true;
        gu.abcNoteNumCurrentlyHighlighted = 3;

        gu.clearHighlightNoteInABCSVG();

        expect(scrollSpy).toHaveBeenCalledWith({ block: 'end', behavior: 'smooth' });
      });

      it('throws when debugMode is on and the note element has no real scrollIntoView (documents an un-guarded jsdom gap)', () => {
        // This locks in the actual current behavior: production code assumes
        // Element.prototype.scrollIntoView exists (true in real browsers);
        // jsdom does not provide it, so debugMode + off-screen highlighting
        // clearing throws under jsdom unless the element is polyfilled/spied
        // (see the two tests above).
        document.body.innerHTML = `<div id="abcNoteNum_${idx}_0" class="note highlighted"></div>`;
        gu.debugMode = true;
        gu.abcNoteNumCurrentlyHighlighted = 0;

        expect(() => gu.clearHighlightNoteInABCSVG()).toThrow(/scrollIntoView is not a function/);
      });
    });
  });

  describe('highlightNoteInABCSVGFromPercentComplete', () => {
    it('maps a percent-complete value through note_mapping_array to highlight the correct note', () => {
      document.body.innerHTML =
        `<div id="abcNoteNum_${idx}_0" class="note"></div>` +
        `<div id="abcNoteNum_${idx}_1" class="note"></div>` +
        `<div id="abcNoteNum_${idx}_2" class="note"></div>`;
      // 4 mapped slots, all "real" notes (true).
      gu.note_mapping_array = [true, true, true, true];

      gu.highlightNoteInABCSVGFromPercentComplete(0.5);

      // curNoteIndex = 0.5 * 4 = 2; loop i=0,1 both truthy -> real_note_index ends at 1.
      expect(gu.abcNoteNumCurrentlyHighlighted).toBe(1);
      expect(document.getElementById(`abcNoteNum_${idx}_1`).getAttribute('class')).toBe(
        'note highlighted'
      );
    });

    it('is a no-op when note_mapping_array is null', () => {
      gu.note_mapping_array = null;
      gu.highlightNoteInABCSVGFromPercentComplete(0.5);
      expect(gu.abcNoteNumCurrentlyHighlighted).toBe(-1);
    });
  });
});

describe('GrooveUtils groove-data / MIDI refresh-flag state', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  it('setGrooveData stores the object on myGrooveData', () => {
    const data = { foo: 'bar' };
    gu.setGrooveData(data);
    expect(gu.myGrooveData).toBe(data);
  });

  it('midiNoteHasChanged / midiResetNoteHasChanged toggle the refresh flag observed via midiEventCallbacks', () => {
    expect(gu.midiEventCallbacks.noteHasChangedSinceLastDataLoad).toBe(false);

    gu.midiNoteHasChanged();
    expect(gu.midiEventCallbacks.noteHasChangedSinceLastDataLoad).toBe(true);
    // doesMidiDataNeedRefresh(root) reads the same flag off of root.
    expect(gu.midiEventCallbacks.doesMidiDataNeedRefresh(gu)).toBe(true);

    gu.midiResetNoteHasChanged();
    expect(gu.midiEventCallbacks.noteHasChangedSinceLastDataLoad).toBe(false);
    expect(gu.midiEventCallbacks.doesMidiDataNeedRefresh(gu)).toBe(false);
  });
});

describe('GrooveUtils.setMetronomeFrequencyDisplay', () => {
  let gu, idx;
  beforeEach(async () => {
    gu = await newGrooveUtils();
    idx = gu.grooveUtilsUniqueIndex;
    document.body.innerHTML = `<div id="midiMetronomeMenu${idx}" class="midiMetronomeMenu"></div>`;
  });

  it('adds " selected" to the menu class when the new frequency is > 0', () => {
    gu.setMetronomeFrequencyDisplay(4);
    expect(document.getElementById(`midiMetronomeMenu${idx}`).className).toBe(
      'midiMetronomeMenu selected'
    );
  });

  it('removes " selected" when the new frequency is 0', () => {
    gu.setMetronomeFrequencyDisplay(4);
    gu.setMetronomeFrequencyDisplay(0);
    expect(document.getElementById(`midiMetronomeMenu${idx}`).className).toBe('midiMetronomeMenu');
  });

  it('is a no-op (does not throw) when the element does not exist', () => {
    document.body.innerHTML = '';
    expect(() => gu.setMetronomeFrequencyDisplay(4)).not.toThrow();
  });
});

describe('GrooveUtils.metronomeMiniMenuClick', () => {
  let gu, idx;
  beforeEach(async () => {
    gu = await newGrooveUtils();
    idx = gu.grooveUtilsUniqueIndex;
    document.body.innerHTML = `<div id="midiMetronomeMenu${idx}" class="midiMetronomeMenu"></div>`;
    // metronomeMiniMenuClick reads root.myGrooveData.metronomeFrequency directly;
    // a fresh instance's myGrooveData is undefined (see grooveDataNew note below),
    // so we seed it explicitly.
    gu.myGrooveData = { metronomeFrequency: 0 };
  });

  it('turns the metronome on (frequency 4), marks the display selected, and flags a MIDI refresh', () => {
    gu.metronomeMiniMenuClick();

    expect(gu.myGrooveData.metronomeFrequency).toBe(4);
    expect(document.getElementById(`midiMetronomeMenu${idx}`).className).toBe(
      'midiMetronomeMenu selected'
    );
    expect(gu.midiEventCallbacks.noteHasChangedSinceLastDataLoad).toBe(true);
  });

  it('turns the metronome back off on a second click', () => {
    gu.metronomeMiniMenuClick();
    gu.metronomeMiniMenuClick();

    expect(gu.myGrooveData.metronomeFrequency).toBe(0);
    expect(document.getElementById(`midiMetronomeMenu${idx}`).className).toBe('midiMetronomeMenu');
  });
});

describe('GrooveUtils.expandOrRetractMIDI_playback', () => {
  let gu, idx;
  beforeEach(async () => {
    gu = await newGrooveUtils();
    idx = gu.grooveUtilsUniqueIndex;
    document.body.innerHTML = `
      <div id="playerControl${idx}" class="playerControl small"></div>
      <div id="playerControlsRow${idx}" class="playerControlsRow small"></div>
      <div id="tempoAndProgress${idx}" class="tempoAndProgress small"></div>
      <div id="midiMetronomeMenu${idx}" class="midiMetronomeMenu small"></div>
      <div id="midiGSLogo${idx}" class="midiGSLogo small"></div>
      <div id="midiExpandImage${idx}" class="midiExpandImage small"></div>
      <div id="MIDIPlayTime${idx}" class="MIDIPlayTime small"></div>
    `;
  });

  it('expands a "small" player to "large" on the first (no-arg) call', () => {
    gu.expandOrRetractMIDI_playback();

    expect(document.getElementById(`playerControl${idx}`).className).toBe('playerControl large');
    expect(document.getElementById(`playerControlsRow${idx}`).className).toBe(
      'playerControlsRow large'
    );
    expect(document.getElementById(`tempoAndProgress${idx}`).className).toBe(
      'tempoAndProgress large'
    );
    expect(document.getElementById(`midiMetronomeMenu${idx}`).className).toBe(
      'midiMetronomeMenu large'
    );
    expect(document.getElementById(`midiGSLogo${idx}`).className).toBe('midiGSLogo large');
    expect(document.getElementById(`midiExpandImage${idx}`).className).toBe(
      'midiExpandImage large'
    );
    expect(document.getElementById(`MIDIPlayTime${idx}`).className).toBe('MIDIPlayTime large');
  });

  it('retracts a "large" player back to "small" on the next call (toggle behavior)', () => {
    gu.expandOrRetractMIDI_playback(); // -> large
    gu.expandOrRetractMIDI_playback(); // -> small

    expect(document.getElementById(`playerControl${idx}`).className).toBe('playerControl small');
    expect(document.getElementById(`midiExpandImage${idx}`).className).toBe(
      'midiExpandImage small'
    );
  });

  it('forcing expansion while already large re-appends " large" (documents a duplicate-class quirk)', () => {
    // The "make large" branch unconditionally does
    // `className.replace(" small", "") + " large"`. When force+expandElseContract
    // trigger that branch on an *already-large* element (no " small" to strip),
    // the result duplicates the " large" suffix instead of staying idempotent.
    gu.expandOrRetractMIDI_playback(); // -> "playerControl large"
    gu.expandOrRetractMIDI_playback(true, true); // force expand again

    expect(document.getElementById(`playerControl${idx}`).className).toBe(
      'playerControl large large'
    );
  });
});

describe('GrooveUtils.AddMidiPlayerToPage', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  it('inserts the full MIDI player HTML (expandable) into the target element', () => {
    document.body.innerHTML = '<div id="target"></div>';

    gu.AddMidiPlayerToPage('target', 16, true);

    const target = document.getElementById('target');
    const html = target.innerHTML;
    expect(html).toContain('playerControl' + gu.grooveUtilsUniqueIndex);
    expect(html).toContain('midiPlayImage' + gu.grooveUtilsUniqueIndex);
    expect(html).toContain('tempoInput' + gu.grooveUtilsUniqueIndex);
    expect(html).toContain('swingInput' + gu.grooveUtilsUniqueIndex);
    // expandable=true controls
    expect(html).toContain('midiMetronomeMenu' + gu.grooveUtilsUniqueIndex);
    expect(html).toContain('midiExpandImage' + gu.grooveUtilsUniqueIndex);
    expect(html).toContain('midiGSLogo' + gu.grooveUtilsUniqueIndex);

    // Real elements were attached, so the click/input listeners could bind
    // without throwing (see next tests for behavioral confirmation).
    expect(document.getElementById('tempoInput' + gu.grooveUtilsUniqueIndex)).toBeTruthy();
  });

  it('enables swing when the division supports it (16), and disables it otherwise (4)', () => {
    document.body.innerHTML = '<div id="target"></div>';
    gu.AddMidiPlayerToPage('target', 16, true);
    expect(gu.swingIsEnabled).toBe(true);

    document.body.innerHTML = '<div id="target2"></div>';
    gu.AddMidiPlayerToPage('target2', 4, false);
    expect(gu.swingIsEnabled).toBe(false);
  });

  it('wires the tempo slider input event to tempoUpdateFromSlider', () => {
    document.body.innerHTML = '<div id="target"></div>';
    gu.AddMidiPlayerToPage('target', 16, true);

    let observedTempo = null;
    gu.tempoChangeCallback = (t) => {
      observedTempo = t;
    };

    const slider = document.getElementById('tempoInput' + gu.grooveUtilsUniqueIndex);
    slider.value = '133';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(observedTempo).toBe('133');
  });

  it('wires the expand button click to expandOrRetractMIDI_playback', () => {
    document.body.innerHTML = '<div id="target"></div>';
    gu.AddMidiPlayerToPage('target', 16, true);

    const idx = gu.grooveUtilsUniqueIndex;
    const playerControl = document.getElementById('playerControl' + idx);
    expect(playerControl.className).toBe('playerControl');

    const expandBtn = document.getElementById('midiExpandImage' + idx);
    expandBtn.dispatchEvent(new Event('click', { bubbles: true }));

    // The freshly-inserted markup's class is just "playerControl" (no "small"
    // or "large" token), so expandOrRetractMIDI_playback's
    // `indexOf("small") > -1` check is false and it falls into the "make
    // small" branch on this very first click.
    expect(playerControl.className).toBe('playerControl small');
  });

  it('wires the metronome menu click to metronomeMiniMenuClick', () => {
    document.body.innerHTML = '<div id="target"></div>';
    gu.myGrooveData = { metronomeFrequency: 0 };
    gu.AddMidiPlayerToPage('target', 16, true);

    const idx = gu.grooveUtilsUniqueIndex;
    const metronomeMenu = document.getElementById('midiMetronomeMenu' + idx);
    metronomeMenu.dispatchEvent(new Event('click', { bubbles: true }));

    expect(gu.myGrooveData.metronomeFrequency).toBe(4);
  });

  it('throws when the target element does not exist and the division supports swing (documents an un-guarded gap)', () => {
    // The initial `html_element.innerHTML = ...` assignment IS guarded with
    // `if (html_element)`, so a missing target does not fail there. But
    // because nothing was ever inserted, the swingInput/swingOutput elements
    // never exist either. `swingEnabled(true)` at the end of
    // AddMidiPlayerToPage cascades into swingUpdateText(), which writes to
    // `document.getElementById('swingOutput'+uid).innerHTML` with no null
    // guard -- so this throws instead of silently no-op'ing.
    document.body.innerHTML = '';
    expect(() => gu.AddMidiPlayerToPage('doesNotExist', 16, true)).toThrow(
      /Cannot set propert(y|ies) of null/
    );
  });

  it('also throws for a non-swing division, since setSwingSlider itself is un-guarded', () => {
    // swingEnabled(false) takes the setSwing(0) -> setSwingSlider(0) path,
    // which does `document.getElementById('swingInput'+uid).value = ...`
    // with no null guard at all -- so this throws too, just one line earlier
    // than the swing-enabled case above (before ever reaching swingOutput).
    document.body.innerHTML = '';
    expect(() => gu.AddMidiPlayerToPage('doesNotExist', 4, true)).toThrow(
      /Cannot set propert(y|ies) of null/
    );
  });
});

describe('GrooveUtils.loadFullScreenGrooveScribe', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when myGrooveData is undefined (documents grooveDataNew's constructor bug)", () => {
    // root.myGrooveData is initialized via `root.myGrooveData = root.grooveDataNew();`
    // but grooveDataNew is a constructor-style function meant to be invoked with
    // `new` (it sets fields on `this` and returns nothing). Called as a plain
    // method here, `this` is `root` itself, so `root.grooveDataNew()` returns
    // undefined and root.myGrooveData ends up undefined on a fresh instance.
    expect(gu.myGrooveData).toBeUndefined();
    expect(() => gu.loadFullScreenGrooveScribe()).toThrow(/debugMode/);
  });

  it('opens a new tab with the full GrooveScribe URL and focuses it, given a real groove data object', () => {
    const grooveData = {};
    gu.grooveDataNew.call(grooveData); // construct a proper instance manually
    gu.myGrooveData = grooveData;

    const focusSpy = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({ focus: focusSpy }));

    gu.loadFullScreenGrooveScribe();

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(url).toContain('https://www.mikeslessons.com/gscribe');
    expect(target).toBe('_blank');
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Optional: real abc2svg render path (renderABCtoSVG, line ~2154).
//
// abc2svg-1.js is a single self-contained global `function Abc(user){...}`
// declaration (no CommonJS/ESM exports), same shape as jsmidgen.js. We can
// evaluate it out-of-module with `new Function` (as legacyLoader.js's
// installMidiGlobal does for Midi) and install the resulting constructor as
// `globalThis.Abc`, which groove_utils.js's renderABCtoSVG references as a
// bare global. This actually works under jsdom -- abc2svg is pure
// string/geometry computation with no DOM/canvas dependency -- so we exercise
// the real render path rather than skipping it.
describe('GrooveUtils.renderABCtoSVG (real abc2svg-1.js)', () => {
  let AbcCtor;

  beforeEach(() => {
    if (AbcCtor === undefined) {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const src = fs.readFileSync(path.resolve(here, '../../js/abc2svg-1.js'), 'utf8');
      // eslint-disable-next-line no-new-func
      const factory = new Function(
        `${src}\n;return (typeof Abc !== 'undefined') ? Abc : undefined;`
      );
      AbcCtor = factory() || null;
    }
    if (AbcCtor) globalThis.Abc = AbcCtor;
  });

  afterEach(() => {
    delete globalThis.Abc;
  });

  it('renders a small tune to an SVG string with no errors', async () => {
    if (!AbcCtor) {
      // Environment couldn't provide the Abc global; skip gracefully rather
      // than force a false pass.
      return;
    }
    const gu = await newGrooveUtils();

    const result = gu.renderABCtoSVG('X:1\nT:Test\nM:4/4\nL:1/4\nK:C\nC D E F|\n');

    expect(result.error_html).toBe('');
    expect(result.svg.length).toBeGreaterThan(0);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('abc2s'); // abc2svg's own <title> marker
  });
});
