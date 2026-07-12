import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newGrooveWriter, buildGridDOM } from '../helpers/loadGrooveWriter.js';
import { installMidiGlobal } from '../helpers/legacyLoader.js';

// Regression coverage for the view/edit-mode toggling and page-bootstrap layer
// of js/groove_writer.js: swapViewEditMode, expandAuthoringViewWhenNecessary,
// show/close_MetronomeAutoSpeedupConfiguration, setupWriterHotKeys,
// displayNewSVG, tempoChangeCallback, and the big runsOnPageLoad bootstrap.
//
// All fixture ids below were taken from index.html (or, for runsOnPageLoad's
// deep dependency chain, discovered iteratively by running the function and
// reading each thrown error - see the runsOnPageLoad describe block for the
// full list of what had to be shimmed and why).

// --- MIDI mock (same shape as tests/groove_utils/midi-playback.test.js) ---
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
    WebAudio: {},
    AudioTag: {},
  };
}

describe('GrooveWriter view & lifecycle', () => {
  describe('swapViewEditMode', () => {
    // toggles root.myGrooveUtils.viewMode, shows/hides ".edit-block" elements
    // (via the module-private showHideCSS_ClassDisplay helper), relabels
    // #view-edit-switch, and (unless dontUpdateURL) calls root.updateCurrentURL.

    it('starts in view mode (viewMode=true) on a fresh instance', async () => {
      const gw = await newGrooveWriter();
      expect(gw.myGrooveUtils.viewMode).toBe(true);
    });

    it('first call flips to edit mode: shows .edit-block, relabels the button to "Switch to VIEW mode"', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '<span id="view-edit-switch"></span><div class="edit-block"></div>';
      gw.updateCurrentURL = vi.fn();

      gw.swapViewEditMode(true);

      expect(gw.myGrooveUtils.viewMode).toBe(false);
      expect(document.getElementById('view-edit-switch').innerHTML).toBe('Switch to VIEW mode');
      expect(document.querySelector('.edit-block').style.display).toBe('block');
    });

    it('second call flips back to view mode: hides .edit-block, relabels the button to "Switch to EDIT mode"', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '<span id="view-edit-switch"></span><div class="edit-block"></div>';
      gw.updateCurrentURL = vi.fn();

      gw.swapViewEditMode(true);
      gw.swapViewEditMode(true);

      expect(gw.myGrooveUtils.viewMode).toBe(true);
      expect(document.getElementById('view-edit-switch').innerHTML).toBe('Switch to EDIT mode');
      expect(document.querySelector('.edit-block').style.display).toBe('none');
    });

    it('calls root.updateCurrentURL unless dontUpdateURL is truthy', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '<div class="edit-block"></div>';
      gw.updateCurrentURL = vi.fn();

      gw.swapViewEditMode(false);
      expect(gw.updateCurrentURL).toHaveBeenCalledTimes(1);

      gw.updateCurrentURL.mockClear();
      gw.swapViewEditMode(true);
      expect(gw.updateCurrentURL).not.toHaveBeenCalled();
    });

    it('does not throw when #view-edit-switch is absent from the DOM (null-guarded)', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '<div class="edit-block"></div>'; // no #view-edit-switch
      gw.updateCurrentURL = vi.fn();

      expect(() => gw.swapViewEditMode(true)).not.toThrow();
    });
  });

  describe('expandAuthoringViewWhenNecessary', () => {
    // Adds/removes the "expanded" class on #musicalInput.
    //
    // QUIRK (observed, not assumed): the function signature is
    // (numNotesPerMeasure, numberOfMeasures), but the body only ever reads the
    // *closure* variable class_number_of_measures for the measures check - the
    // numberOfMeasures **parameter is never referenced**. On a fresh
    // GrooveWriter, class_number_of_measures defaults to 1, so passing a large
    // numberOfMeasures argument has zero effect unless something else (e.g.
    // changeDivision/set_Default_notes) has actually mutated the closure state.

    it('adds "expanded" when numNotesPerMeasure > 16', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '<div id="musicalInput" class="fullWidthEle edit-block"></div>';

      gw.expandAuthoringViewWhenNecessary(17, 1);

      expect(document.getElementById('musicalInput').className).toBe(
        'fullWidthEle edit-block expanded'
      );
    });

    it('removes "expanded" when numNotesPerMeasure <= 16 and the closure measure count is 1', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML =
        '<div id="musicalInput" class="fullWidthEle edit-block expanded"></div>';

      gw.expandAuthoringViewWhenNecessary(4, 1);

      expect(document.getElementById('musicalInput').className).toBe('fullWidthEle edit-block');
    });

    it('QUIRK: the numberOfMeasures argument is ignored - passing a large value does NOT force "expanded" on a fresh instance', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '<div id="musicalInput" class="fullWidthEle edit-block"></div>';

      // A real 99-measure tune would need to be expanded, but the function
      // only consults the internal class_number_of_measures (still 1 on a
      // fresh instance), never the "99" argument passed here.
      gw.expandAuthoringViewWhenNecessary(4, 99);

      expect(document.getElementById('musicalInput').className).toBe('fullWidthEle edit-block');
    });

    it('logs a console warning but does not throw when #musicalInput is absent', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '';
      const warnSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      expect(() => gw.expandAuthoringViewWhenNecessary(17, 1)).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('show_MetronomeAutoSpeedupConfiguration / close_MetronomeAutoSpeedupConfiguration', () => {
    function buildPopupFixture() {
      document.body.innerHTML =
        '<div id="metronomeAutoSpeedupConfiguration" style="display:none"></div>' +
        '<span id="metronomeAutoSpeedupTempoIncreaseAmountOutput"></span>' +
        '<input id="metronomeAutoSpeedupTempoIncreaseAmount" value="5">' +
        '<span id="metronomeAutoSpeedupTempoIncreaseIntervalOutput"></span>' +
        '<input id="metronomeAutoSpeedupTempoIncreaseInterval" value="2">';
    }

    it('show_MetronomeAutoSpeedupConfiguration displays the popup and syncs the output labels from the range inputs', async () => {
      const gw = await newGrooveWriter();
      buildPopupFixture();
      document.getElementById('metronomeAutoSpeedupTempoIncreaseAmount').value = '7';
      document.getElementById('metronomeAutoSpeedupTempoIncreaseInterval').value = '3';

      gw.show_MetronomeAutoSpeedupConfiguration();

      expect(document.getElementById('metronomeAutoSpeedupConfiguration').style.display).toBe(
        'block'
      );
      expect(
        document.getElementById('metronomeAutoSpeedupTempoIncreaseAmountOutput').innerHTML
      ).toBe('7');
      expect(
        document.getElementById('metronomeAutoSpeedupTempoIncreaseIntervalOutput').innerHTML
      ).toBe('3');
    });

    it('close_MetronomeAutoSpeedupConfiguration hides the popup', async () => {
      const gw = await newGrooveWriter();
      buildPopupFixture();
      gw.show_MetronomeAutoSpeedupConfiguration();
      expect(document.getElementById('metronomeAutoSpeedupConfiguration').style.display).toBe(
        'block'
      );

      gw.close_MetronomeAutoSpeedupConfiguration();

      expect(document.getElementById('metronomeAutoSpeedupConfiguration').style.display).toBe(
        'none'
      );
    });

    it('close_MetronomeAutoSpeedupConfiguration does not throw when the popup element is absent', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML = '';
      expect(() => gw.close_MetronomeAutoSpeedupConfiguration('cancel')).not.toThrow();
    });
  });

  describe('setupWriterHotKeys', () => {
    // Installs a document-level "keydown" listener (via addEventListener, not
    // document.onkeydown) that only acts when the event target is NOT an
    // INPUT/TEXTAREA (range inputs are exempted from that exclusion). Handled
    // keys: ctrl-z (90) -> undoCommand, ctrl-y (89) -> redoCommand, left arrow
    // (37) -> myGrooveUtils.downTempo, right arrow (39) -> myGrooveUtils.upTempo.

    function fireKeydown(gw, { which, ctrlKey = false, targetTag = 'div', targetType }) {
      const target = document.createElement(targetTag);
      if (targetType) target.type = targetType;
      document.body.appendChild(target);
      const evt = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(evt, 'which', { value: which });
      Object.defineProperty(evt, 'ctrlKey', { value: ctrlKey });
      Object.defineProperty(evt, 'target', { value: target });
      document.dispatchEvent(evt);
    }

    async function setup() {
      const gw = await newGrooveWriter();
      gw.undoCommand = vi.fn();
      gw.redoCommand = vi.fn();
      gw.myGrooveUtils.downTempo = vi.fn();
      gw.myGrooveUtils.upTempo = vi.fn();
      gw.setupWriterHotKeys();
      return gw;
    }

    it('ctrl-z (which=90, ctrlKey) on a non-input target calls undoCommand', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 90, ctrlKey: true });
      expect(gw.undoCommand).toHaveBeenCalledTimes(1);
    });

    it('ctrl-y (which=89, ctrlKey) on a non-input target calls redoCommand', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 89, ctrlKey: true });
      expect(gw.redoCommand).toHaveBeenCalledTimes(1);
    });

    it('left arrow (which=37) calls myGrooveUtils.downTempo', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 37 });
      expect(gw.myGrooveUtils.downTempo).toHaveBeenCalledTimes(1);
    });

    it('right arrow (which=39) calls myGrooveUtils.upTempo', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 39 });
      expect(gw.myGrooveUtils.upTempo).toHaveBeenCalledTimes(1);
    });

    it('"z" without ctrlKey falls through to the default case - no undo is triggered', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 90, ctrlKey: false });
      expect(gw.undoCommand).not.toHaveBeenCalled();
    });

    it('ctrl-z is ignored when the event target is an INPUT (text type)', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 90, ctrlKey: true, targetTag: 'input', targetType: 'text' });
      expect(gw.undoCommand).not.toHaveBeenCalled();
    });

    it('ctrl-z on an INPUT of type "range" is NOT excluded (the source explicitly carves out range inputs)', async () => {
      const gw = await setup();
      fireKeydown(gw, { which: 90, ctrlKey: true, targetTag: 'input', targetType: 'range' });
      expect(gw.undoCommand).toHaveBeenCalledTimes(1);
    });
  });

  describe('displayNewSVG', () => {
    // Reads #ABCsource.value, calls myGrooveUtils.renderABCtoSVG on it, and
    // places the resulting svg/error_html into #svgTarget / #diverr.

    it('places the rendered svg into #svgTarget and error_html into #diverr', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML =
        '<textarea id="ABCsource">X:1</textarea><div id="svgTarget"></div><div id="diverr"></div>';
      gw.myGrooveUtils.renderABCtoSVG = vi
        .fn()
        .mockReturnValue({ svg: '<svg>hi</svg>', error_html: '' });

      gw.displayNewSVG();

      expect(gw.myGrooveUtils.renderABCtoSVG).toHaveBeenCalledWith('X:1');
      expect(document.getElementById('svgTarget').innerHTML).toBe('<svg>hi</svg>');
      expect(document.getElementById('diverr').innerHTML).toBe('');
    });

    it('surfaces a non-empty error_html into #diverr', async () => {
      const gw = await newGrooveWriter();
      document.body.innerHTML =
        '<textarea id="ABCsource">bad abc</textarea><div id="svgTarget"></div><div id="diverr"></div>';
      gw.myGrooveUtils.renderABCtoSVG = vi
        .fn()
        .mockReturnValue({ svg: '', error_html: '<div class="error">oops</div>' });

      gw.displayNewSVG();

      expect(document.getElementById('svgTarget').innerHTML).toBe('');
      expect(document.getElementById('diverr').innerHTML).toBe('<div class="error">oops</div>');
    });
  });

  describe('tempoChangeCallback', () => {
    // Debounces root.updateCurrentURL behind a 300ms window.setTimeout,
    // clearing any pending timeout on each call (module-scope
    // global_tempoChangeCallbackTimeout is shared across instances/tests in
    // the same module instance, but since GrooveWriter's tempoChangeCallback
    // doesn't read the newTempo argument at all - it just schedules
    // updateCurrentURL - that state sharing doesn't affect these assertions).

    it('does not call updateCurrentURL synchronously', async () => {
      vi.useFakeTimers();
      const gw = await newGrooveWriter();
      gw.updateCurrentURL = vi.fn();

      gw.tempoChangeCallback(120);

      expect(gw.updateCurrentURL).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('calls updateCurrentURL once 300ms after the call', async () => {
      vi.useFakeTimers();
      const gw = await newGrooveWriter();
      gw.updateCurrentURL = vi.fn();

      gw.tempoChangeCallback(120);
      vi.advanceTimersByTime(300);

      expect(gw.updateCurrentURL).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('debounces rapid successive calls into a single updateCurrentURL invocation', async () => {
      vi.useFakeTimers();
      const gw = await newGrooveWriter();
      gw.updateCurrentURL = vi.fn();

      gw.tempoChangeCallback(121);
      gw.tempoChangeCallback(122);
      gw.tempoChangeCallback(123);
      vi.advanceTimersByTime(300);

      expect(gw.updateCurrentURL).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('runsOnPageLoad', () => {
    // The full page-bootstrap function. It touches a large, cross-cutting
    // slice of DOM + GrooveUtils state:
    //   setupWriterHotKeys() -> setupPermutationMenu() (needs #permutationAnchor)
    //   -> setTimeSigLabel() (needs #timeSigLabel)
    //   -> swapViewEditMode(true) (needs .edit-block, optionally #view-edit-switch)
    //   -> selectButton(#subdivision_<N>ths)
    //   -> myGrooveUtils.AddMidiPlayerToPage("midiPlayer", ...) (needs #midiPlayer)
    //   -> set_Default_notes(window.location.search) (needs the note-grid DOM,
    //      #ABCsource/#svgTarget/#diverr/#measureContainer/#tuneTitle/#tuneAuthor/
    //      #tuneComments, and calls all the way down into displayNewSVG ->
    //      myGrooveUtils.renderABCtoSVG, myGrooveUtils.setTempo/setSwing, and
    //      setMetronomeFrequency -> setMetronomeButton, which needs
    //      #metronomeOff/#metronome4ths/#metronome8ths/#metronome16ths -
    //      found by tracing the console.log("Warning ... null tag_class
    //      passed in") that appeared before these were added to the fixture)
    //   -> myGrooveUtils.oneTimeInitializeMidi()
    //   -> myGrooveUtils.getBrowserInfo()
    //
    // Two infra-only gaps had to be bridged to let this real (unmodified)
    // production code run end-to-end under jsdom/Vitest's per-file ES module
    // transform:
    //
    // 1. groove_writer.js references bare `constant_ABC_*` / `constant_OUR_*`
    //    identifiers that are `var`s declared at the top of groove_utils.js.
    //    In the real app both files are classic <script> tags sharing one
    //    global scope, so those vars are visible everywhere. Under Vitest's
    //    per-file ESM transform each file gets its own module scope, so a
    //    top-level `var` in groove_utils.js's module never reaches
    //    globalThis, and groove_writer.js's bare reference throws
    //    ReferenceError. We shim every `constant_*` from groove_utils.js onto
    //    globalThis by reading the real source and evaluating each
    //    declaration's RHS (values copied verbatim from production, not
    //    invented).
    // 2. myGrooveUtils.renderABCtoSVG needs the `Abc` global (abc2svg-1.js).
    //    Since displayNewSVG itself is already covered directly above, here
    //    we stub renderABCtoSVG (a GrooveUtils method, not part of this
    //    file's surface) rather than also loading abc2svg.
    //
    // jsdom additionally logs (but does not throw for) "Not implemented:
    // window.getComputedStyle(elt, pseudoElt)" from groove_utils.js's
    // updateRangeSlider (called via setTempo/setSwing) - jsdom returns a
    // usable-but-empty CSSStyleDeclaration for unsupported pseudo-elements
    // instead of throwing, matching real browsers' graceful degradation. We
    // stub it here purely to keep test output free of that expected noise.
    //
    // With those two gaps bridged and a full grid fixture (buildGridDOM),
    // runsOnPageLoad runs to completion without throwing.

    const here = path.dirname(fileURLToPath(import.meta.url));
    const groove_utils_src = fs.readFileSync(
      path.resolve(here, '../../js/groove_utils.js'),
      'utf8'
    );

    function shimConstants() {
      const re = /^var (constant_\w+)\s*=(.+?);/gm;
      let m;
      while ((m = re.exec(groove_utils_src))) {
        globalThis[m[1]] = new Function(`return (${m[2]});`)();
      }
    }

    function buildFixture(gw) {
      buildGridDOM(gw, 1); // note grid + #tuneTitle/#tuneAuthor/#tuneComments/#showLegend

      document.body.innerHTML +=
        '<span id="view-edit-switch"></span>' +
        '<div class="edit-block"></div>' +
        '<span id="timeSigLabel"></span>' +
        '<span id="permutationAnchor"></span>' +
        '<div id="PermutationOptions"></div>' +
        '<span id="subdivision_8ths" class="left-button subdivision edit-block"></span>' +
        '<span id="subdivision_16ths" class="left-button subdivision edit-block"></span>' +
        '<span id="subdivision_32ths" class="left-button subdivision edit-block"></span>' +
        '<span id="subdivision_12ths" class="left-button subdivision edit-block"></span>' +
        '<span id="subdivision_24ths" class="left-button subdivision edit-block"></span>' +
        '<span id="subdivision_48ths" class="left-button subdivision edit-block"></span>' +
        '<button id="metronomeOff" class="metronomeButton"></button>' +
        '<button id="metronome4ths" class="metronomeButton"></button>' +
        '<button id="metronome8ths" class="metronomeButton"></button>' +
        '<button id="metronome16ths" class="metronomeButton"></button>' +
        '<div id="midiPlayer"></div>' +
        '<textarea id="ABCsource"></textarea>' +
        '<div id="svgTarget"></div>' +
        '<div id="diverr"></div>' +
        '<div id="measureContainer"></div>' +
        '<div id="musicalInput" class="fullWidthEle edit-block"></div>';
    }

    async function setup() {
      shimConstants();
      globalThis.MIDI = makeMidiMock();
      await installMidiGlobal(); // Midi (jsmidgen) global, used by MIDI-file building paths
      const gw = await newGrooveWriter();
      buildFixture(gw);
      // out of scope for this file (covered by displayNewSVG's own describe
      // block above); avoid pulling in abc2svg here.
      gw.myGrooveUtils.renderABCtoSVG = vi
        .fn()
        .mockReturnValue({ svg: '<svg>stub</svg>', error_html: '' });
      // silence jsdom's harmless "not implemented" pseudo-element console noise
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: () => '' });
      return gw;
    }

    it('runs to completion without throwing, given the full bootstrap fixture', async () => {
      const gw = await setup();
      expect(() => gw.runsOnPageLoad()).not.toThrow();
      delete globalThis.MIDI;
    });

    it('wires the midi player HTML into #midiPlayer', async () => {
      const gw = await setup();
      gw.runsOnPageLoad();
      expect(document.getElementById('midiPlayer').innerHTML.length).toBeGreaterThan(0);
      delete globalThis.MIDI;
    });

    it('wires setupWriterHotKeys: firing a ctrl-z keydown after bootstrap invokes undoCommand', async () => {
      const gw = await setup();
      gw.runsOnPageLoad();
      gw.undoCommand = vi.fn(); // re-stub post-bootstrap; the listener reads root.undoCommand at fire-time

      const target = document.createElement('div');
      document.body.appendChild(target);
      const evt = new KeyboardEvent('keydown', { bubbles: true });
      Object.defineProperty(evt, 'which', { value: 90 });
      Object.defineProperty(evt, 'ctrlKey', { value: true });
      Object.defineProperty(evt, 'target', { value: target });
      document.dispatchEvent(evt);

      expect(gw.undoCommand).toHaveBeenCalledTimes(1);
      delete globalThis.MIDI;
    });

    it('enters edit mode by default (Mode query param defaults to "edit", not "view") and selects the current subdivision button', async () => {
      const gw = await setup();
      gw.runsOnPageLoad();

      // default query var "Mode" resolves to "edit" (see
      // getQueryVariableFromURL("Mode", "edit")), which is != "view", so
      // swapViewEditMode(true) runs and flips OUT of the default view-mode.
      expect(gw.myGrooveUtils.viewMode).toBe(false);
      expect(document.querySelector('.edit-block').style.display).toBe('block');

      // class_notes_per_measure defaults to 16 (Div=16 default), so
      // #subdivision_16ths should carry the "buttonSelected" class.
      expect(document.getElementById('subdivision_16ths').className).toContain('buttonSelected');
      delete globalThis.MIDI;
    });

    it('populates root.browserInfo via myGrooveUtils.getBrowserInfo()', async () => {
      const gw = await setup();
      gw.runsOnPageLoad();

      expect(gw.browserInfo).toBeDefined();
      expect(typeof gw.browserInfo.browser).toBe('string');
      delete globalThis.MIDI;
    });

    it('wires root.myGrooveUtils.tempoChangeCallback to root.tempoChangeCallback', async () => {
      const gw = await setup();
      gw.runsOnPageLoad();

      expect(gw.myGrooveUtils.tempoChangeCallback).toBe(gw.tempoChangeCallback);
      delete globalThis.MIDI;
    });
  });
});
