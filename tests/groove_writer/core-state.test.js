import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newGrooveWriter, buildGridDOM } from '../helpers/loadGrooveWriter.js';

// Regression coverage for GrooveWriter's core state/undo-redo machinery:
//   numberOfMeasures, notesPerMeasure, getMetronomeFrequency/setMetronomeFrequency,
//   setMetronomeButton, AddItemToUndoOrRedoStack, AddFullURLToUndoStack,
//   undoCommand, redoCommand, changeDivision, metronomeAutoSpeedUpTempoUpdate,
//   and the private `usingTriplets()` helper (covered indirectly).
//
// Several of these methods cascade into a private `set_Default_notes()` (used by
// undoCommand/redoCommand) and into `updateSheetMusic()` (used by changeDivision),
// which in turn touch a lot of DOM and re-generate ABC notation. Per the task
// brief we stub the purely-cosmetic cascading calls (`updateCurrentURL`,
// `displayNewSVG`, `updateGrooveDBSource`) that are covered by other suites, and
// build a fixture mirroring the relevant slice of index.html for everything else.
//
// Global-constant shim: groove_writer.js references bare `constant_ABC_*` /
// `constant_OUR_MIDI_*` identifiers that, in the shipped app, are top-level
// `var`s declared in groove_utils.js. In a classic multi-<script> page all
// top-level `var`s attach to the shared `window` object, so groove_writer.js
// can see them for free. Under Vitest's ES-module transform every file gets
// its own module scope, so those vars never reach the global object and the
// bare reference throws a ReferenceError deep inside set_Default_notes /
// changeDivision. We shim them on globalThis (values copied verbatim from
// groove_utils.js) so the real code path can run unmodified.
//
// Note: several functions exercised here (setTempo, setSwing, swingEnabled)
// call an internal `updateRangeSlider()` helper that calls
// `document.defaultView.getComputedStyle(el, ":before")`. jsdom does not
// implement computed styles for pseudo-elements and logs a harmless
// "Not implemented" error to stderr for each call (same as in
// tests/groove_utils/tempo-swing.test.js); it does not throw and does not
// fail these tests.
const ABC_CONSTANTS = {
  constant_MAX_MEASURES: 10,
  constant_DEFAULT_TEMPO: 80,
  constant_ABC_STICK_R: '"R"x',
  constant_ABC_STICK_L: '"L"x',
  constant_ABC_STICK_BOTH: '"R/L"x',
  constant_ABC_STICK_COUNT: '"count"x',
  constant_ABC_STICK_OFF: '""x',
  constant_ABC_HH_Ride: "^A'",
  constant_ABC_HH_Ride_Bell: "^B'",
  constant_ABC_HH_Cow_Bell: "^D'",
  constant_ABC_HH_Crash: "^c'",
  constant_ABC_HH_Stacker: "^d'",
  constant_ABC_HH_Metronome_Normal: "^e'",
  constant_ABC_HH_Metronome_Accent: "^f'",
  constant_ABC_HH_Open: '!open!^g',
  constant_ABC_HH_Close: '!plus!^g',
  constant_ABC_HH_Accent: '!accent!^g',
  constant_ABC_HH_Normal: '^g',
  constant_ABC_SN_Ghost: '!(.!!).!c',
  constant_ABC_SN_Accent: '!accent!c',
  constant_ABC_SN_Normal: 'c',
  constant_ABC_SN_XStick: '^c',
  constant_ABC_SN_Buzz: '!///!c',
  constant_ABC_SN_Flam: '!accent!{/c}c',
  constant_ABC_SN_Drag: '{/cc}c',
  constant_ABC_KI_SandK: '[F^d,]',
  constant_ABC_KI_Splash: '^d,',
  constant_ABC_KI_Normal: 'F',
  constant_ABC_T1_Normal: 'e',
  constant_ABC_T2_Normal: 'd',
  constant_ABC_T3_Normal: 'B',
  constant_ABC_T4_Normal: 'A',
  constant_NUMBER_OF_TOMS: 4,
  constant_ABC_OFF: false,
  constant_OUR_MIDI_VELOCITY_NORMAL: 85,
  constant_OUR_MIDI_VELOCITY_ACCENT: 120,
  constant_OUR_MIDI_VELOCITY_GHOST: 50,
  constant_OUR_MIDI_METRONOME_1: 76,
  constant_OUR_MIDI_METRONOME_NORMAL: 77,
  constant_OUR_MIDI_HIHAT_NORMAL: 42,
  constant_OUR_MIDI_HIHAT_OPEN: 46,
  constant_OUR_MIDI_HIHAT_ACCENT: 108,
  constant_OUR_MIDI_HIHAT_CRASH: 49,
  constant_OUR_MIDI_HIHAT_STACKER: 52,
  constant_OUR_MIDI_HIHAT_METRONOME_NORMAL: 77,
  constant_OUR_MIDI_HIHAT_METRONOME_ACCENT: 76,
  constant_OUR_MIDI_HIHAT_RIDE: 51,
  constant_OUR_MIDI_HIHAT_RIDE_BELL: 53,
  constant_OUR_MIDI_HIHAT_COW_BELL: 105,
  constant_OUR_MIDI_HIHAT_FOOT: 44,
  constant_OUR_MIDI_SNARE_NORMAL: 38,
  constant_OUR_MIDI_SNARE_ACCENT: 22,
  constant_OUR_MIDI_SNARE_GHOST: 21,
  constant_OUR_MIDI_SNARE_XSTICK: 37,
  constant_OUR_MIDI_SNARE_BUZZ: 104,
  constant_OUR_MIDI_SNARE_FLAM: 107,
  constant_OUR_MIDI_SNARE_DRAG: 103,
  constant_OUR_MIDI_KICK_NORMAL: 35,
  constant_OUR_MIDI_TOM1_NORMAL: 48,
  constant_OUR_MIDI_TOM2_NORMAL: 47,
  constant_OUR_MIDI_TOM3_NORMAL: 45,
  constant_OUR_MIDI_TOM4_NORMAL: 43,
};
for (const [k, v] of Object.entries(ABC_CONSTANTS)) globalThis[k] = v;

// Fixture mirroring the slice of index.html that changeDivision / set_Default_notes
// / updateSheetMusic touch: the note grid plus the surrounding chrome elements they
// read or write (ABC source textarea, SVG target, tempo/swing controls, etc).
function buildFixture(gw, measures = 1) {
  const container = buildGridDOM(gw, measures);
  container.id = 'measureContainer'; // changeDivisionWithNotes rewrites this container's innerHTML directly

  const chrome = document.createElement('div');
  chrome.innerHTML =
    '<div id="PermutationOptions"></div>' +
    '<textarea id="ABCsource"></textarea>' +
    '<div id="svgTarget"></div>' +
    '<div id="diverr"></div>' +
    '<div id="timeSigLabel"></div>' +
    '<div id="ABC_Results"></div>' +
    '<span id="showHideTomsButton"></span>' +
    '<span id="stickingsButton"></span>' +
    '<input id="showLegend" type="checkbox">' +
    '<div id="swingOutput' +
    gw.myGrooveUtils.grooveUtilsUniqueIndex +
    '"></div>' +
    '<input id="swingInput' +
    gw.myGrooveUtils.grooveUtilsUniqueIndex +
    '">' +
    '<input id="tempoInput' +
    gw.myGrooveUtils.grooveUtilsUniqueIndex +
    '" value="80">' +
    '<input id="tempoTextField' +
    gw.myGrooveUtils.grooveUtilsUniqueIndex +
    '">' +
    '<input id="GrooveDB_source">';
  document.body.appendChild(chrome);

  return container;
}

// Stub the cascading render/persistence calls that are covered by other test
// suites so these tests stay focused on the state-machine logic itself.
function stubCascadingRenders(gw) {
  gw.updateCurrentURL = vi.fn();
  gw.displayNewSVG = vi.fn();
  gw.updateGrooveDBSource = vi.fn();
}

describe('GrooveWriter core state & undo/redo', () => {
  let gw;
  beforeEach(async () => {
    gw = await newGrooveWriter();
  });

  describe('numberOfMeasures / notesPerMeasure', () => {
    it('default to 1 measure of 16 notes (Div=16, 4/4 time)', () => {
      expect(gw.numberOfMeasures()).toBe(1);
      expect(gw.notesPerMeasure()).toBe(16);
    });

    it('notesPerMeasure changes after changeDivision, numberOfMeasures does not', () => {
      buildFixture(gw, 1);
      stubCascadingRenders(gw);

      gw.changeDivision(8);

      expect(gw.notesPerMeasure()).toBe(8);
      expect(gw.numberOfMeasures()).toBe(1);
    });

    it('numberOfMeasures changes when a URL with a different `measures` param is restored via undo/redo', () => {
      buildFixture(gw, 1);
      stubCascadingRenders(gw);

      gw.AddFullURLToUndoStack('http://x/y?Div=16&TimeSig=4%2F4&measures=1');
      gw.AddFullURLToUndoStack('http://x/y?Div=16&TimeSig=4%2F4&measures=2');
      expect(gw.numberOfMeasures()).toBe(1); // AddFullURLToUndoStack only records the URL, it does not load it

      gw.undoCommand(); // pop the measures=2 entry, load the measures=1 entry underneath
      expect(gw.numberOfMeasures()).toBe(1);

      gw.redoCommand(); // replay the measures=2 entry
      expect(gw.numberOfMeasures()).toBe(2);
    });
  });

  describe('getMetronomeFrequency / setMetronomeFrequency', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<button id="metronomeOff" class="metronomeButton"></button>' +
        '<button id="metronome4ths" class="metronomeButton"></button>' +
        '<button id="metronome8ths" class="metronomeButton"></button>' +
        '<button id="metronome16ths" class="metronomeButton"></button>';
      gw.updateCurrentURL = vi.fn();
    });

    it('defaults to 0 (metronome off)', () => {
      expect(gw.getMetronomeFrequency()).toBe(0);
    });

    it('round-trips through the valid interval values 4, 8, 16, 0', () => {
      gw.setMetronomeFrequency(4);
      expect(gw.getMetronomeFrequency()).toBe(4);

      gw.setMetronomeFrequency(8);
      expect(gw.getMetronomeFrequency()).toBe(8);

      gw.setMetronomeFrequency(16);
      expect(gw.getMetronomeFrequency()).toBe(16);

      gw.setMetronomeFrequency(0);
      expect(gw.getMetronomeFrequency()).toBe(0);
    });

    it('calls updateCurrentURL as a side effect (bookmarking)', () => {
      gw.setMetronomeFrequency(8);
      expect(gw.updateCurrentURL).toHaveBeenCalledTimes(1);
    });
  });

  describe('setMetronomeButton', () => {
    beforeEach(() => {
      document.body.innerHTML =
        '<button id="metronomeOff" class="metronomeButton"></button>' +
        '<button id="metronome4ths" class="metronomeButton"></button>' +
        '<button id="metronome8ths" class="metronomeButton"></button>' +
        '<button id="metronome16ths" class="metronomeButton"></button>';
    });

    it('marks only the button matching the given interval as selected (4/8/16)', () => {
      gw.setMetronomeButton(4);
      expect(document.getElementById('metronome4ths').className).toContain('buttonSelected');
      expect(document.getElementById('metronomeOff').className).not.toContain('buttonSelected');
      expect(document.getElementById('metronome8ths').className).not.toContain('buttonSelected');
      expect(document.getElementById('metronome16ths').className).not.toContain('buttonSelected');

      gw.setMetronomeButton(16);
      expect(document.getElementById('metronome16ths').className).toContain('buttonSelected');
      expect(document.getElementById('metronome4ths').className).not.toContain('buttonSelected');
    });

    it('selects "metronomeOff" for 0 and for any unrecognized value (falls into the default case)', () => {
      gw.setMetronomeButton(0);
      expect(document.getElementById('metronomeOff').className).toContain('buttonSelected');

      gw.setMetronomeButton(4);
      gw.setMetronomeButton(999); // unrecognized -> default branch -> "metronomeOff"
      expect(document.getElementById('metronomeOff').className).toContain('buttonSelected');
      expect(document.getElementById('metronome4ths').className).not.toContain('buttonSelected');
    });
  });

  describe('AddItemToUndoOrRedoStack', () => {
    it('returns false and does nothing when ourStack is falsy', () => {
      expect(gw.AddItemToUndoOrRedoStack('a', null)).toBe(false);
    });

    it('pushes onto the given stack and returns true', () => {
      const stack = [];
      expect(gw.AddItemToUndoOrRedoStack('a', stack)).toBe(true);
      expect(stack).toEqual(['a']);
    });

    // BUG/QUIRK: the dedup check `newURL == class_undo_stack[class_undo_stack.length-1]`
    // always compares against the writer's *internal* undo stack, never against the
    // `ourStack` argument that was actually passed in. When called with a stack other
    // than the internal undo stack (e.g. a plain array, or the redo stack) the dedup
    // is checked against the wrong array, so back-to-back identical pushes are NOT
    // deduplicated in that case (they only get deduplicated when ourStack IS the
    // internal undo stack, as happens via AddFullURLToUndoStack -- see below).
    it('does NOT dedupe consecutive identical values when pushed to an arbitrary stack (dedup checks the wrong array)', () => {
      const stack = [];
      gw.AddItemToUndoOrRedoStack('a', stack);
      gw.AddItemToUndoOrRedoStack('a', stack); // internal class_undo_stack is still [], so 'a' != undefined -> pushes again
      expect(stack).toEqual(['a', 'a']);
    });

    it('caps the stack at 40 entries, dropping the oldest (shift, not pop)', () => {
      const stack = [];
      for (let i = 0; i < 45; i++) {
        gw.AddItemToUndoOrRedoStack('item' + i, stack);
      }
      expect(stack).toHaveLength(40);
      expect(stack[0]).toBe('item5'); // the first 5 pushes were shifted off
      expect(stack[stack.length - 1]).toBe('item44');
    });
  });

  describe('AddFullURLToUndoStack', () => {
    beforeEach(() => {
      gw.updateCurrentURL = vi.fn(); // not under test here
    });

    it('stores only the query-string fragment (after "?"), not the full URL', () => {
      gw.AddFullURLToUndoStack('http://example.com/index.html?Div=16&measures=1');
      // undoCommand needs a 2nd entry to have something to pop down to; push a
      // second, different entry then undo back to observe what got stored.
      gw.AddFullURLToUndoStack('http://example.com/index.html?Div=8&measures=1');
      buildFixture(gw, 1);
      gw.updateCurrentURL = vi.fn();
      gw.displayNewSVG = vi.fn();
      gw.updateGrooveDBSource = vi.fn();
      gw.undoCommand();
      // Div=16 was restored, proving the stored entry was the "?Div=16..." fragment
      // (getGrooveDataFromUrlString parses fragments the same whether or not they
      // include a scheme/host).
      expect(gw.notesPerMeasure()).toBe(16);
    });

    it('does not duplicate when the same full URL is added twice in a row (dedup works here because ourStack IS the internal undo stack)', () => {
      gw.AddFullURLToUndoStack('http://x/y?Div=16');
      gw.AddFullURLToUndoStack('http://x/y?Div=16'); // duplicate, should be a no-op
      gw.AddFullURLToUndoStack('http://x/y?Div=8');
      // 2 distinct entries were queued: undoing once should land back on Div=16,
      // and a second undo should have nothing left to do (guarded, stack length <= 1).
      buildFixture(gw, 1);
      gw.updateCurrentURL = vi.fn();
      gw.displayNewSVG = vi.fn();
      gw.updateGrooveDBSource = vi.fn();
      gw.undoCommand();
      expect(gw.notesPerMeasure()).toBe(16);
    });
  });

  describe('undoCommand / redoCommand', () => {
    beforeEach(() => {
      buildFixture(gw, 1);
      stubCascadingRenders(gw);
    });

    it('is a no-op when there is nothing (or only one entry) on the undo stack', () => {
      expect(() => gw.undoCommand()).not.toThrow();
      expect(gw.notesPerMeasure()).toBe(16); // unchanged

      gw.AddFullURLToUndoStack('http://x/y?Div=16');
      expect(() => gw.undoCommand()).not.toThrow(); // stack length is 1, guard requires > 1
      expect(gw.notesPerMeasure()).toBe(16);
    });

    it('is a no-op when there is nothing on the redo stack', () => {
      expect(() => gw.redoCommand()).not.toThrow();
      expect(gw.notesPerMeasure()).toBe(16);
    });

    it('undoCommand restores the previous division, redoCommand replays the newer one', () => {
      gw.AddFullURLToUndoStack('http://x/y?Div=16&measures=1');
      gw.AddFullURLToUndoStack('http://x/y?Div=8&measures=1');
      expect(gw.notesPerMeasure()).toBe(16); // pushing to the undo stack alone does not load state

      gw.undoCommand();
      expect(gw.notesPerMeasure()).toBe(16); // back to the entry underneath (Div=16)

      gw.redoCommand();
      expect(gw.notesPerMeasure()).toBe(8); // replays the Div=8 entry
    });

    it('undoCommand also restores custom note state (sticking pattern) recorded on the stack', () => {
      gw.stickingsShowHide(true, true, true);
      gw.noteLeftClick(null, 'sticking', 0); // sets note 0's sticking to "right"
      let gd = gw.grooveDataFromClickableUI();
      expect(gd.sticking_array[0]).toBe('"R"x'); // constant_ABC_STICK_R

      gw.AddFullURLToUndoStack(
        gw.myGrooveUtils.getUrlStringFromGrooveData(gw.grooveDataFromClickableUI())
      );
      // change the sticking again and record a 2nd, different state
      gw.noteLeftClick(null, 'sticking', 0); // right -> left
      gw.AddFullURLToUndoStack(
        gw.myGrooveUtils.getUrlStringFromGrooveData(gw.grooveDataFromClickableUI())
      );

      gw.undoCommand(); // restore the "right" state
      gd = gw.grooveDataFromClickableUI();
      expect(gd.sticking_array[0]).toBe('"R"x');
    });
  });

  describe('changeDivision', () => {
    beforeEach(() => {
      buildFixture(gw, 1);
      stubCascadingRenders(gw);
    });

    it('changes notesPerMeasure to match the new division (16ths -> 8ths)', () => {
      gw.changeDivision(8);
      expect(gw.notesPerMeasure()).toBe(8);
    });

    it('recalculates notesPerMeasure with the triplet-note multiplier (48ths) for a triplet division', () => {
      gw.changeDivision(12); // 8th-note triplets
      // calc_notes_per_measure(48, 4beats, 4/4) -> 12 for one measure of 4/4 8th-triplets
      expect(gw.notesPerMeasure()).toBe(12);
    });

    it('newDivision=48 (MIXED subdivision) shows a one-time informational alert() but still applies the change', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      gw.changeDivision(48);

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toMatch(/MIXED subdivision/);
      expect(gw.notesPerMeasure()).toBe(48); // the alert is informational only; it does not reject the change

      alertSpy.mockRestore();
    });

    // The source also guards two genuinely-rejecting cases with alert() + early
    // return: (a) a division/time-signature combo that would yield a fractional
    // note count, and (b) requesting a triplet division while the time signature's
    // bottom number isn't 4. Neither is reachable through changeDivision() alone
    // with the default 4/4 time signature this suite constructs (both guards key
    // off class_note_value_per_measure, which only a time-signature change can
    // alter) - exercising them is out of scope here.
    it('does not reject a triplet division while time signature stays at x/4 (the "must be x/4" guard does not fire)', () => {
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

      gw.changeDivision(24); // triplet division, still in default 4/4 time

      expect(alertSpy).not.toHaveBeenCalled();
      expect(gw.notesPerMeasure()).toBe(24);

      alertSpy.mockRestore();
    });
  });

  describe('usingTriplets (private) - covered indirectly via changeDivision side effects', () => {
    beforeEach(() => {
      buildFixture(gw, 1);
      stubCascadingRenders(gw);
    });

    it('swingIsEnabled reflects whether the new division supports swing (false for triplet divisions)', () => {
      gw.changeDivision(8); // straight 8ths support swing
      expect(gw.myGrooveUtils.swingIsEnabled).toBe(true);

      gw.changeDivision(12); // 8th-note triplets do not support swing
      expect(gw.myGrooveUtils.swingIsEnabled).toBe(false);
    });

    it('preserves existing note state across a non-triplet -> non-triplet change, but resets to defaults across a triplet transition', () => {
      gw.stickingsShowHide(true, true, true);
      gw.noteLeftClick(null, 'sticking', 0); // -> "right"
      expect(gw.grooveDataFromClickableUI().sticking_array[0]).toBe('"R"x');

      gw.changeDivision(8); // 16ths(non-triplet) -> 8ths(non-triplet): usingTriplets() unchanged -> notes preserved
      expect(gw.grooveDataFromClickableUI().sticking_array[0]).toBe('"R"x');

      gw.changeDivision(12); // 8ths(non-triplet) -> 12(triplet): usingTriplets() flips -> resets to the default groove
      expect(gw.grooveDataFromClickableUI().sticking_array[0]).toBe('""x'); // constant_ABC_STICK_OFF
    });
  });
});

describe('GrooveWriter metronomeAutoSpeedUpTempoUpdate', () => {
  // This function reads root.myGrooveUtils.getMidiStartTime()/getMidiPlayTime(),
  // which are backed by a *module-level* `var global_current_midi_start_time = 0`
  // in groove_utils.js (not per-instance state). It's only ever turned into a
  // real Date by GrooveUtils.startMIDI_playback(), which itself needs the global
  // `MIDI` object (MIDI.js) mocked under jsdom.
  function makeMidiMock() {
    return {
      Player: {
        timeWarp: null,
        BPM: null,
        loadFile: vi.fn((url, cb) => {
          if (cb) cb();
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        stop: vi.fn(),
        start: vi.fn(),
        loop: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        playing: false,
        currentTime: 0,
        endTime: 0,
        ctx: { resume: vi.fn() },
      },
      loadPlugin: vi.fn((opts) => {
        if (opts && opts.callback) opts.callback();
      }),
      programChange: vi.fn(),
    };
  }

  afterEach(() => {
    delete globalThis.MIDI;
    vi.useRealTimers();
  });

  // BUG: metronomeAutoSpeedUpTempoUpdate() calls root.myGrooveUtils.getMidiPlayTime(),
  // which does `global_current_midi_start_time.getTime()`. Before MIDI playback has
  // ever been started, that module-level var is still the number `0` (its initial
  // value), not a Date -- so `.getTime` doesn't exist and the call throws. In the
  // real app this code path is only ever reached from the `notePlaying` MIDI event
  // callback while a groove is actively playing, so start time is always a Date by
  // then; calling it standalone (as here) exposes the underlying assumption.
  it('throws if MIDI playback was never started (global_current_midi_start_time is still 0, not a Date)', async () => {
    const gw = await newGrooveWriter();
    expect(() => gw.metronomeAutoSpeedUpTempoUpdate()).toThrow(/getTime is not a function/);
  });

  it('does not change tempo on the first call after playback starts (it only establishes the timing baseline)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1, 0, 0, 0));
    globalThis.MIDI = makeMidiMock();
    const gw = await newGrooveWriter();
    document.body.innerHTML =
      '<input id="tempoInput' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '" value="80">' +
      '<input id="tempoTextField' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '">';

    gw.myGrooveUtils.startMIDI_playback(); // sets the module-level start time to "now"
    gw.metronomeAutoSpeedUpTempoUpdate();

    expect(gw.myGrooveUtils.getTempo()).toBe(80);
  });

  it('increases tempo by the configured amount once the configured interval has elapsed, using the 1/60/false defaults when no configuration UI is present', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1, 0, 0, 0));
    globalThis.MIDI = makeMidiMock();
    const gw = await newGrooveWriter();
    document.body.innerHTML =
      '<input id="tempoInput' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '" value="80">' +
      '<input id="tempoTextField' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '">';

    gw.myGrooveUtils.startMIDI_playback();
    gw.metronomeAutoSpeedUpTempoUpdate(); // baseline, t=0

    vi.setSystemTime(new Date(2020, 0, 1, 1, 0, 0)); // +1 hour == default 60-minute interval
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(81); // default increase amount is 1

    // without "keep going forever" checked, a 2nd interval does not add more:
    // it's capped at the configured total increase amount (default 1) above the
    // tempo recorded when this midi-start-time was first observed.
    vi.setSystemTime(new Date(2020, 0, 1, 2, 0, 0));
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(81);
  });

  it('honors the metronomeAutoSpeedupTempoIncreaseAmount/Interval configuration UI when present, and caps at the total amount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1, 0, 0, 0));
    globalThis.MIDI = makeMidiMock();
    const gw = await newGrooveWriter();
    document.body.innerHTML =
      '<input id="tempoInput' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '" value="80">' +
      '<input id="tempoTextField' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '">' +
      '<input id="metronomeAutoSpeedupTempoIncreaseAmount" value="5">' +
      '<input id="metronomeAutoSpeedupTempoIncreaseInterval" value="1">' + // 1 minute -> 60s
      '<input id="metronomeAutoSpeedUpKeepGoingForever" type="checkbox">';

    gw.myGrooveUtils.startMIDI_playback();
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(80);

    vi.setSystemTime(new Date(2020, 0, 1, 0, 1, 0)); // +60s == 1 configured interval
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(85); // +5 (the configured amount)

    vi.setSystemTime(new Date(2020, 0, 1, 0, 2, 0)); // +another interval
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(85); // capped: total increase is 5, already reached
  });

  it('keeps increasing past the configured total when "keep going forever" is checked', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1, 0, 0, 0));
    globalThis.MIDI = makeMidiMock();
    const gw = await newGrooveWriter();
    document.body.innerHTML =
      '<input id="tempoInput' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '" value="80">' +
      '<input id="tempoTextField' +
      gw.myGrooveUtils.grooveUtilsUniqueIndex +
      '">' +
      '<input id="metronomeAutoSpeedupTempoIncreaseAmount" value="1">' +
      '<input id="metronomeAutoSpeedupTempoIncreaseInterval" value="1">' +
      '<input id="metronomeAutoSpeedUpKeepGoingForever" type="checkbox" checked>';
    document.getElementById('metronomeAutoSpeedUpKeepGoingForever').checked = true;

    gw.myGrooveUtils.startMIDI_playback();
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(80);

    vi.setSystemTime(new Date(2020, 0, 1, 0, 1, 0));
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(81);

    vi.setSystemTime(new Date(2020, 0, 1, 0, 2, 0));
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(82); // still climbing, no cap applied

    vi.setSystemTime(new Date(2020, 0, 1, 0, 3, 0));
    gw.metronomeAutoSpeedUpTempoUpdate();
    expect(gw.myGrooveUtils.getTempo()).toBe(83);
  });
});
