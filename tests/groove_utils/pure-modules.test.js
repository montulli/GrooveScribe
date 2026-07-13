import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';
import { createABCFromGrooveData } from '../../js/abcNotation.js';
import { create_MIDIURLFromGrooveData } from '../../js/midiFile.js';

// Demonstrates the Step-2 extractions: ABC-notation and MIDI-file generation now
// live in their own modules, importable directly. They take a GrooveUtils
// instance for the helpers still in GrooveUtils; GrooveUtils delegates to them,
// so producing the SAME output as the delegating methods proves the extraction
// is behavior-preserving.
describe('extracted pure-core modules (direct import)', () => {
  let gu;
  beforeEach(async () => {
    await installMidiGlobal();
    gu = await newGrooveUtils();
  });

  const grooveData = () =>
    gu.getGrooveDataFromUrlString(
      '?TimeSig=4/4&Div=16&Tempo=90&Measures=1' +
        '&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|'
    );

  it('abcNotation.createABCFromGrooveData matches the delegating GrooveUtils method', () => {
    const gd = grooveData();
    // %%fullsvg carries a per-call counter; normalize it before comparing.
    const norm = (s) => s.replace(/%%fullsvg _\d+/g, '%%fullsvg _N');
    expect(norm(createABCFromGrooveData(gu, gd, 600))).toBe(
      norm(gu.createABCFromGrooveData(gd, 600))
    );
  });

  it('midiFile.create_MIDIURLFromGrooveData matches the delegating GrooveUtils method', () => {
    const gd = grooveData();
    expect(create_MIDIURLFromGrooveData(gu, gd)).toBe(gu.create_MIDIURLFromGrooveData(gd));
  });
});
