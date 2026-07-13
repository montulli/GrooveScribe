import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';

// Regression coverage for the MIDI *playback control* layer in groove_utils.js
// (as opposed to midi-generation.test.js, which covers MIDI *file encoding*).
//
// These functions all call into the global `MIDI` object, which is the
// MIDI.js library (MIDI.Player, MIDI.loadPlugin, etc.) and is not present
// under jsdom. We build a plain-object mock of exactly the `MIDI.*` members
// the source actually touches (found via:
//   grep -nE "MIDI\.[A-Za-z_.]+" js/groove_utils.js
// ), assign it to globalThis.MIDI before each test, and assert on the spies.
//
// Module-state note: groove_utils.js declares several top-level `var`s
// (global_midiInitialized, global_current_midi_start_time,
// global_last_midi_update_time, global_total_midi_play_time_msecs, etc.)
// that live on the ES module instance, not on the GrooveUtils instance. Since
// vitest's dynamic import() caches modules by resolved path, two
// `newGrooveUtils()` calls in the same test file would normally share that
// state (confirmed by probing). We call `vi.resetModules()` before each
// `newGrooveUtils()` so every test starts from a truly fresh module (matches
// the existing pattern in tests/helpers/loadDisplay.js).
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
    // Referenced only in /*global*/ comments / not called directly in the
    // functions under test, but declared here for completeness in case a
    // helper touches them.
    WebAudio: {},
    AudioTag: {},
  };
}

describe('GrooveUtils MIDI playback controls', () => {
  let gu;

  beforeEach(async () => {
    globalThis.MIDI = makeMidiMock();
    await installMidiGlobal(); // Midi (jsmidgen) - loadMidiDataEvent's default path builds a MIDI file
    vi.resetModules(); // fresh groove_utils.js module instance -> fresh module-level state
    gu = await newGrooveUtils();
  });

  afterEach(() => {
    delete globalThis.MIDI;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function addElement(id) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
    return el;
  }

  // A minimal but real grooveData, built the same way the app does when
  // loading a groove from a URL query string (see midi-generation.test.js).
  function realGrooveData() {
    return gu.getGrooveDataFromUrlString(
      '?TimeSig=4/4&Div=16&Tempo=90&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----o-------o---|&K=|o-------o-------|'
    );
  }

  describe('oneTimeInitializeMidi', () => {
    it('calls MIDI.loadPlugin (with a soundfont URL + callback) on first invocation', () => {
      addElement('midiPlayImage' + gu.grooveUtilsUniqueIndex);

      gu.oneTimeInitializeMidi();

      expect(globalThis.MIDI.loadPlugin).toHaveBeenCalledTimes(1);
      const opts = globalThis.MIDI.loadPlugin.mock.calls[0][0];
      expect(typeof opts.soundfontUrl).toBe('string');
      expect(opts.instruments).toEqual(['gunshot']);
      expect(typeof opts.callback).toBe('function');
    });

    it('is idempotent: a second call does not call MIDI.loadPlugin again (global_midiInitialized guard)', () => {
      addElement('midiPlayImage' + gu.grooveUtilsUniqueIndex);

      gu.oneTimeInitializeMidi();
      expect(globalThis.MIDI.loadPlugin).toHaveBeenCalledTimes(1);

      gu.oneTimeInitializeMidi();
      // Still just 1 - the second call takes the `global_midiInitialized`
      // early-return branch instead of calling MIDI.loadPlugin again.
      expect(globalThis.MIDI.loadPlugin).toHaveBeenCalledTimes(1);
    });

    it('the loadPlugin callback calls MIDI.programChange(9, 127) ("Gunshot" instrument)', () => {
      addElement('midiPlayImage' + gu.grooveUtilsUniqueIndex);

      gu.oneTimeInitializeMidi();

      expect(globalThis.MIDI.programChange).toHaveBeenCalledWith(9, 127);
    });

    it('both the first-time and already-initialized paths set the play icon to "Stopped" and wire its onclick', () => {
      const icon = addElement('midiPlayImage' + gu.grooveUtilsUniqueIndex);

      gu.oneTimeInitializeMidi(); // not-yet-initialized branch
      expect(icon.className).toBe('midiPlayImage Stopped');
      expect(typeof icon.onclick).toBe('function');

      icon.className = ''; // reset to prove the 2nd call re-applies it
      gu.oneTimeInitializeMidi(); // already-initialized branch (global_midiInitialized === true)
      expect(icon.className).toBe('midiPlayImage Stopped');
    });
  });

  describe('isPlaying', () => {
    it('reflects MIDI.Player.playing', () => {
      globalThis.MIDI.Player.playing = false;
      expect(gu.isPlaying()).toBe(false);

      globalThis.MIDI.Player.playing = true;
      expect(gu.isPlaying()).toBe(true);
    });
  });

  describe('startMIDI_playback', () => {
    it('returns immediately (no MIDI.Player calls) if already playing', () => {
      globalThis.MIDI.Player.playing = true;

      gu.startMIDI_playback();

      expect(globalThis.MIDI.Player.start).not.toHaveBeenCalled();
      expect(globalThis.MIDI.Player.stop).not.toHaveBeenCalled();
      expect(globalThis.MIDI.Player.resume).not.toHaveBeenCalled();
    });

    it('resumes (rather than restarting) when paused and the midi data does not need a refresh', () => {
      globalThis.MIDI.Player.playing = false;
      gu.isMIDIPaused = true;
      gu.midiResetNoteHasChanged(); // doesMidiDataNeedRefresh() -> false

      gu.startMIDI_playback();

      expect(globalThis.MIDI.Player.resume).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.start).not.toHaveBeenCalled();
      expect(gu.isMIDIPaused).toBe(false); // cleared unconditionally at the end
    });

    it('when paused but the midi data DOES need a refresh, takes the full stop/loop/start path instead of resume', () => {
      globalThis.MIDI.Player.playing = false;
      gu.isMIDIPaused = true;
      gu.myGrooveData = realGrooveData();
      gu.midiNoteHasChanged(); // doesMidiDataNeedRefresh() -> true

      gu.startMIDI_playback();

      expect(globalThis.MIDI.Player.resume).not.toHaveBeenCalled();
      expect(globalThis.MIDI.Player.ctx.resume).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.start).toHaveBeenCalledTimes(1);
    });

    it('when not playing and not paused, resumes the audio ctx, stops, sets loop, and starts', () => {
      globalThis.MIDI.Player.playing = false;
      gu.isMIDIPaused = false;
      gu.shouldMIDIRepeat = false;

      gu.startMIDI_playback();

      expect(globalThis.MIDI.Player.ctx.resume).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.loop).toHaveBeenCalledWith(false);
      expect(globalThis.MIDI.Player.start).toHaveBeenCalledTimes(1);
      expect(gu.isMIDIPaused).toBe(false);
    });

    it('passes the current shouldMIDIRepeat value to MIDI.Player.loop', () => {
      gu.shouldMIDIRepeat = true;
      gu.startMIDI_playback();
      expect(globalThis.MIDI.Player.loop).toHaveBeenCalledWith(true);
    });

    it('sets global start-time state, observable via getMidiStartTime returning a Date after starting', () => {
      expect(gu.getMidiStartTime()).toBe(0); // module-level default before any playback

      gu.startMIDI_playback();

      expect(gu.getMidiStartTime()).toBeInstanceOf(Date);
    });
  });

  describe('pauseMIDI_playback', () => {
    it('calls MIDI.Player.pause and flips isMIDIPaused when not already paused', () => {
      gu.isMIDIPaused = false;

      gu.pauseMIDI_playback();

      expect(globalThis.MIDI.Player.pause).toHaveBeenCalledTimes(1);
      expect(gu.isMIDIPaused).toBe(true);
    });

    it('no-ops (does not call MIDI.Player.pause again) if already paused', () => {
      gu.isMIDIPaused = true;

      gu.pauseMIDI_playback();

      expect(globalThis.MIDI.Player.pause).not.toHaveBeenCalled();
      expect(gu.isMIDIPaused).toBe(true);
    });
  });

  describe('stopMIDI_playback', () => {
    it('calls MIDI.Player.stop and clears isMIDIPaused when playing', () => {
      globalThis.MIDI.Player.playing = true;
      gu.isMIDIPaused = false;

      gu.stopMIDI_playback();

      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(gu.isMIDIPaused).toBe(false);
    });

    it('calls MIDI.Player.stop when merely paused (not actively playing)', () => {
      globalThis.MIDI.Player.playing = false;
      gu.isMIDIPaused = true;

      gu.stopMIDI_playback();

      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(gu.isMIDIPaused).toBe(false);
    });

    it('no-ops when neither playing nor paused', () => {
      globalThis.MIDI.Player.playing = false;
      gu.isMIDIPaused = false;

      gu.stopMIDI_playback();

      expect(globalThis.MIDI.Player.stop).not.toHaveBeenCalled();
    });
  });

  describe('startOrStopMIDI_playback', () => {
    it('calls stopMIDI_playback (MIDI.Player.stop) when playing', () => {
      globalThis.MIDI.Player.playing = true;

      gu.startOrStopMIDI_playback();

      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.start).not.toHaveBeenCalled();
    });

    it('calls startMIDI_playback (MIDI.Player.start) when not playing', () => {
      globalThis.MIDI.Player.playing = false;

      gu.startOrStopMIDI_playback();

      expect(globalThis.MIDI.Player.start).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1); // startMIDI_playback's own stop() before start()
    });
  });

  describe('startOrPauseMIDI_playback', () => {
    it('calls pauseMIDI_playback (MIDI.Player.pause) when playing', () => {
      globalThis.MIDI.Player.playing = true;
      gu.isMIDIPaused = false;

      gu.startOrPauseMIDI_playback();

      expect(globalThis.MIDI.Player.pause).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.start).not.toHaveBeenCalled();
    });

    it('calls startMIDI_playback (MIDI.Player.start) when not playing', () => {
      globalThis.MIDI.Player.playing = false;

      gu.startOrPauseMIDI_playback();

      expect(globalThis.MIDI.Player.start).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.pause).not.toHaveBeenCalled();
    });
  });

  describe('repeatMIDI_playback', () => {
    it('defaults shouldMIDIRepeat to true on a fresh instance', () => {
      expect(gu.shouldMIDIRepeat).toBe(true);
    });

    it('toggles shouldMIDIRepeat true -> false and calls MIDI.Player.loop(false)', () => {
      addElement('midiRepeatImage' + gu.grooveUtilsUniqueIndex);
      gu.shouldMIDIRepeat = true;

      gu.repeatMIDI_playback();

      expect(gu.shouldMIDIRepeat).toBe(false);
      expect(globalThis.MIDI.Player.loop).toHaveBeenCalledWith(false);
    });

    it('toggles shouldMIDIRepeat false -> true and calls MIDI.Player.loop(true)', () => {
      addElement('midiRepeatImage' + gu.grooveUtilsUniqueIndex);
      gu.shouldMIDIRepeat = false;

      gu.repeatMIDI_playback();

      expect(gu.shouldMIDIRepeat).toBe(true);
      expect(globalThis.MIDI.Player.loop).toHaveBeenCalledWith(true);
    });

    it('updates the repeat icon src via the default repeatChangeEvent callback', () => {
      const icon = addElement('midiRepeatImage' + gu.grooveUtilsUniqueIndex);
      gu.shouldMIDIRepeat = true; // -> toggles to false

      gu.repeatMIDI_playback();

      expect(icon.src).toContain('grey_repeat.png');
    });
  });

  describe('loadMIDIFromURL', () => {
    it('sets MIDI.Player.timeWarp=1 and BPM=root.getTempo(), then calls MIDI.Player.loadFile with the URL', () => {
      const url = 'data:audio/midi;base64,XYZ';

      gu.loadMIDIFromURL(url);

      expect(globalThis.MIDI.Player.timeWarp).toBe(1);
      expect(globalThis.MIDI.Player.BPM).toBe(gu.getTempo());
      expect(globalThis.MIDI.Player.loadFile).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.loadFile.mock.calls[0][0]).toBe(url);
    });

    it('registers ourMIDICallback via MIDI.Player.addListener (through midiLoaderCallback)', () => {
      // NOTE (observed behavior): the source calls
      //   MIDI.Player.loadFile(midiURL, midiLoaderCallback());
      // i.e. midiLoaderCallback() is INVOKED immediately and its return value
      // (undefined) is passed as loadFile's 2nd arg. So addListener is wired
      // synchronously on every loadMIDIFromURL call, not deferred until
      // loadFile's own callback fires.
      gu.loadMIDIFromURL('data:audio/midi;base64,XYZ');

      expect(globalThis.MIDI.Player.addListener).toHaveBeenCalledTimes(1);
      expect(typeof globalThis.MIDI.Player.addListener.mock.calls[0][0]).toBe('function');
    });
  });

  describe('MIDISaveAs', () => {
    // MIDISaveAs just assigns `document.location = midiURL` to trigger a
    // browser download/navigation of the data: URL. jsdom does not implement
    // real navigation (it logs a virtual-console "Not implemented: navigation"
    // error and leaves document.location unchanged) and `document.location`
    // cannot be redefined/stubbed in jsdom (Object.defineProperty throws
    // "Cannot redefine property: location" - confirmed by probing). So the
    // only thing we can regression-test here under jsdom is that calling it
    // does not throw from groove_utils.js's own code.
    it('does not throw when assigning document.location to a data: URL', () => {
      expect(() => gu.MIDISaveAs('data:audio/midi;base64,ABC')).not.toThrow();
    });
  });

  describe('getMidiStartTime / getMidiPlayTime / updateMidiPlayTime', () => {
    it('getMidiStartTime is 0 before any playback has started', () => {
      expect(gu.getMidiStartTime()).toBe(0);
    });

    it('getMidiPlayTime returns a Date representing elapsed time since the last start, and grows over time', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

      gu.startMIDI_playback(); // sets global_current_midi_start_time = now

      vi.setSystemTime(new Date('2024-01-01T00:00:05.000Z')); // +5s
      const t1 = gu.getMidiPlayTime();
      expect(t1).toBeInstanceOf(Date);
      expect(t1.getTime()).toBe(5000);

      vi.setSystemTime(new Date('2024-01-01T00:00:07.000Z')); // +2 more seconds
      const t2 = gu.getMidiPlayTime();
      expect(t2.getTime()).toBe(7000);
    });

    it('getMidiPlayTime updates the #totalPlayTime element with accumulated play time/notes/repetitions when present', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const totalEl = addElement('totalPlayTime');
      // totalPlayTime is a <div>, addElement makes a <span> - fine, id lookup only cares about the id.

      gu.startMIDI_playback();
      vi.setSystemTime(new Date('2024-01-01T00:00:05.000Z'));

      gu.getMidiPlayTime();

      expect(totalEl.innerHTML).toContain('Total Play Time:');
      expect(totalEl.innerHTML).toContain('0:05');
      expect(totalEl.innerHTML).toContain('notes:');
      expect(totalEl.innerHTML).toContain('repetitions:');
    });

    it('updateMidiPlayTime writes the elapsed mm:ss string into #MIDIPlayTime<index> when present', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const playTimeEl = addElement('MIDIPlayTime' + gu.grooveUtilsUniqueIndex);

      gu.startMIDI_playback();
      vi.setSystemTime(new Date('2024-01-01T00:00:09.000Z')); // +9s

      gu.updateMidiPlayTime();

      expect(playTimeEl.innerHTML).toBe('0:09');
    });

    it('updateMidiPlayTime is a no-op (does not throw) when the #MIDIPlayTime element is absent, given playback has started', () => {
      // getMidiPlayTime() (called internally) does
      // `global_current_midi_start_time.getTime()`, so it requires a Date -
      // calling updateMidiPlayTime() before any startMIDI_playback() call
      // throws, since global_current_midi_start_time defaults to the number
      // 0 (confirmed by probing). That is out of scope here; this test only
      // covers the documented "element absent" no-op case.
      gu.startMIDI_playback();
      expect(() => gu.updateMidiPlayTime()).not.toThrow();
    });

    it('getMidiPlayTime throws if called before any playback has started (global_current_midi_start_time is still the number 0, not a Date)', () => {
      // Observed actual behavior, not a documented contract - recorded here
      // as a regression pin so an accidental fix/behavior change is visible.
      expect(() => gu.getMidiPlayTime()).toThrow(/getTime is not a function/);
    });
  });

  describe('ourMIDICallback / midiLoaderCallback (private, exercised indirectly via loadMIDIFromURL)', () => {
    // Both functions are module-private (not on `root`), so we reach them
    // the same way the real MIDI.js runtime would: loadMIDIFromURL wires
    // ourMIDICallback into MIDI.Player.addListener; we grab that function
    // reference off the spy and invoke it directly with synthetic MIDI.js
    // event payloads ({ now, end, message, note, channel, velocity }, matching
    // the fields read at groove_utils.js:2939-3014).
    function captureCallback() {
      gu.loadMIDIFromURL('data:audio/midi;base64,XYZ');
      return globalThis.MIDI.Player.addListener.mock.calls[0][0];
    }

    it('does not throw for a "note on" (message 144) kick event mid-song', () => {
      const cb = captureCallback();
      expect(() =>
        cb({
          now: 100,
          end: 1000,
          message: 144,
          note: 35 /* constant_OUR_MIDI_KICK_NORMAL */,
          channel: 9,
          velocity: 100,
        })
      ).not.toThrow();
    });

    it('at song end with shouldMIDIRepeat=false, calls MIDI.Player.stop (stop path, no restart)', () => {
      const cb = captureCallback();
      gu.shouldMIDIRepeat = false;
      globalThis.MIDI.Player.stop.mockClear();

      cb({ now: 1000, end: 1000, message: 0, note: 0, channel: 9, velocity: 0 });

      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.start).not.toHaveBeenCalled();
    });

    it('at song end with shouldMIDIRepeat=true AND a pending data refresh, regenerates: stop then start', () => {
      const cb = captureCallback();
      gu.shouldMIDIRepeat = true;
      gu.myGrooveData = realGrooveData();
      gu.midiNoteHasChanged(); // doesMidiDataNeedRefresh() -> true, forces the regen branch
      globalThis.MIDI.Player.stop.mockClear();
      globalThis.MIDI.Player.start.mockClear();

      expect(() =>
        cb({ now: 1000, end: 1000, message: 0, note: 0, channel: 9, velocity: 0 })
      ).not.toThrow();

      expect(globalThis.MIDI.Player.stop).toHaveBeenCalledTimes(1);
      expect(globalThis.MIDI.Player.start).toHaveBeenCalledTimes(1);
    });

    it('at song end with shouldMIDIRepeat=true and NO pending refresh, leaves looping to MIDI.Player.loop (no extra stop/start)', () => {
      const cb = captureCallback();
      gu.shouldMIDIRepeat = true;
      gu.midiResetNoteHasChanged(); // doesMidiDataNeedRefresh() -> false
      globalThis.MIDI.Player.stop.mockClear();
      globalThis.MIDI.Player.start.mockClear();

      cb({ now: 1000, end: 1000, message: 0, note: 0, channel: 9, velocity: 0 });

      // advanceMetronomeOptionsOffsetClickStartRotation() also returns false
      // by default (no offset-click rotation configured), so neither branch
      // fires and MIDI.js's own `.loop()` flag is left to handle the repeat.
      expect(globalThis.MIDI.Player.stop).not.toHaveBeenCalled();
      expect(globalThis.MIDI.Player.start).not.toHaveBeenCalled();
    });
  });
});
