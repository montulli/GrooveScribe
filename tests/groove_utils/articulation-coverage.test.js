import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils, installMidiGlobal } from '../helpers/legacyLoader.js';
import { coverageGrooves } from '../fixtures/coverage-grooves.js';

// Data-driven sweep: run every fixture groove (see fixtures/coverage-grooves.js)
// through the full parse -> ABC -> MIDI -> re-encode pipeline. Collectively the
// fixtures use every drum articulation across straight and triplet divisions,
// multiple time signatures, swing, metronome frequencies and multi-measure
// grooves, which exercises the large per-articulation ABC and MIDI mapping
// ladders in groove_utils.js.
//
// Assertions here are structural (valid, non-empty, deterministic output) rather
// than musical -- the point is to cover the code paths and catch regressions
// where a groove that renders today suddenly throws or produces empty output.
describe('articulation & rendering coverage sweep', () => {
  let gu;
  beforeEach(async () => {
    await installMidiGlobal();
    gu = await newGrooveUtils();
  });

  it.each(coverageGrooves)('parses "$name" into a populated grooveData', ({ url }) => {
    const gd = gu.getGrooveDataFromUrlString(url);
    expect(gd).toBeTruthy();
    expect(gd.notesPerMeasure).toBeGreaterThan(0);
    expect(gd.numberOfMeasures).toBeGreaterThanOrEqual(1);
    const expectedLen = gd.notesPerMeasure * gd.numberOfMeasures;
    expect(gd.hh_array.length).toBe(expectedLen);
    expect(gd.snare_array.length).toBe(expectedLen);
    expect(gd.kick_array.length).toBe(expectedLen);
  });

  it.each(coverageGrooves)('renders "$name" to a non-empty ABC string', ({ url }) => {
    const gd = gu.getGrooveDataFromUrlString(url);
    const abc = gu.createABCFromGrooveData(gd, 600);
    expect(typeof abc).toBe('string');
    expect(abc.length).toBeGreaterThan(0);
    // Every ABC tune carries an X: index header and a meter line (the X number
    // is a per-instance counter, so match the field, not a fixed value).
    expect(abc).toMatch(/X:\d+/);
    expect(abc).toMatch(/M:\s*\d+\/\d+/);
  });

  it.each(coverageGrooves)(
    'generates a MIDI data URL for "$name" (both output types)',
    ({ url }) => {
      const gd = gu.getGrooveDataFromUrlString(url);
      // Default (Custom / "our" velocities) path...
      const custom = gu.create_MIDIURLFromGrooveData(gd);
      // ...and the general_MIDI path (different velocity/note mapping branch).
      const general = gu.create_MIDIURLFromGrooveData(gd, 'general_MIDI');
      for (const midiUrl of [custom, general]) {
        expect(midiUrl.startsWith('data:audio/midi;base64,')).toBe(true);
        const b64 = midiUrl.slice('data:audio/midi;base64,'.length);
        // Decoded MIDI files begin with the "MThd" header chunk.
        expect(atob(b64).startsWith('MThd')).toBe(true);
      }
    }
  );

  it.each(coverageGrooves)(
    'round-trips "$name" through URL encoding without throwing',
    ({ url }) => {
      const gd = gu.getGrooveDataFromUrlString(url);
      const encoded = gu.getUrlStringFromGrooveData(gd);
      expect(encoded).toContain('TimeSig=');
      // Re-parsing the encoding must yield the same voice array lengths.
      const gd2 = gu.getGrooveDataFromUrlString(encoded);
      expect(gd2.hh_array.length).toBe(gd.hh_array.length);
      expect(gd2.snare_array.length).toBe(gd.snare_array.length);
    }
  );

  it('produces deterministic ABC and MIDI for a given groove', () => {
    const { url } = coverageGrooves[0];
    const gd1 = gu.getGrooveDataFromUrlString(url);
    const gd2 = gu.getGrooveDataFromUrlString(url);
    // ABC embeds a per-instance %%fullsvg counter, so normalize it out.
    const norm = (s) => s.replace(/%%fullsvg _\d+/g, '%%fullsvg _N');
    expect(norm(gu.createABCFromGrooveData(gd1, 600))).toBe(
      norm(gu.createABCFromGrooveData(gd2, 600))
    );
    expect(gu.create_MIDIURLFromGrooveData(gd1)).toBe(gu.create_MIDIURLFromGrooveData(gd2));
  });
});
