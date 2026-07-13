import { vi } from 'vitest';

// A stand-in for the GrooveUtils global used by groove_display.js.
//
// groove_display.js is an orchestration layer: it wires DOM elements to
// GrooveUtils and the MIDI player. Its own logic is the wiring -- which
// GrooveUtils methods it calls, with what arguments, and what HTML scaffolding
// it emits. GrooveUtils itself is covered by its own suite and drags in abc2svg
// + MIDI + audio, so here we replace it with spies and assert the wiring.
//
// install() sets globalThis.GrooveUtils to a constructor whose every method is a
// vi.fn(). Each constructed instance is recorded in `instances` so tests can
// inspect the spies GrooveDisplay actually used.

export function installMockGrooveUtils() {
  const instances = [];

  function GrooveUtils() {
    const self = this;

    // Mirrors the real grooveDataNew: sets fields on `this` (invoked via `new`).
    this.grooveDataNew = function grooveDataNew() {
      this.notesPerMeasure = 16;
      this.timeDivision = 16;
      this.numberOfMeasures = 1;
      this.numBeats = 4;
      this.noteValue = 4;
      this.sticking_array = [];
      this.hh_array = [];
      this.snare_array = [];
      this.kick_array = [];
      this.toms_array = [[], [], [], []];
      this.tempo = 80;
      this.swingPercent = 0;
      this.metronomeFrequency = 0;
    };

    // Pure-ish helpers return deterministic, inspectable values.
    this.mergeDrumTabLines = vi.fn((a, b) => `merged(${a}+${b})`);
    this.noteArraysFromURLData = vi.fn((type, tab) => [`${type}:${tab}`]);
    this.getGrooveDataFromUrlString = vi.fn((url) => {
      const gd = {};
      self.grooveDataNew.call(gd);
      gd.__fromUrl = url;
      return gd;
    });
    this.createABCFromGrooveData = vi.fn(() => 'ABC-NOTATION');
    this.renderABCtoSVG = vi.fn(() => ({ svg: '<svg data-mock="1"></svg>' }));

    // Side-effecting player / MIDI methods: spies only.
    this.setGrooveData = vi.fn();
    this.AddMidiPlayerToPage = vi.fn();
    this.expandOrRetractMIDI_playback = vi.fn();
    this.setTempo = vi.fn();
    this.setSwing = vi.fn();
    this.setMetronomeFrequencyDisplay = vi.fn();
    this.oneTimeInitializeMidi = vi.fn();

    instances.push(this);
  }

  // groove_display.js imports GrooveUtils as an ES module, so the mock is
  // injected via `vi.mock('../../js/groove_utils.js', () => ({ get GrooveUtils()
  // { return globalThis.__mockGrooveUtilsCtor; } }))` in each test file — the
  // getter reads this so beforeEach can install a fresh mock per test.
  globalThis.__mockGrooveUtilsCtor = GrooveUtils;
  // Also kept on globalThis.GrooveUtils for any code still reading the global.
  globalThis.GrooveUtils = GrooveUtils;

  return {
    instances,
    // Convenience: the most recently constructed instance (GrooveDisplay makes a
    // fresh `new GrooveUtils()` per public call).
    get last() {
      return instances[instances.length - 1];
    },
  };
}

export function uninstallMockGrooveUtils() {
  delete globalThis.GrooveUtils;
  delete globalThis.__mockGrooveUtilsCtor;
}
