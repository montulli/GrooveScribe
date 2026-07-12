import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for URL <-> grooveData serialization. Groove Scribe
// encodes an entire groove into the query string (this is how grooves are
// shared and embedded), so a break here silently corrupts saved/shared links.
describe('GrooveUtils URL serialization', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  const SAMPLE_URL =
    '?TimeSig=4/4&Div=16&Tempo=80&Measures=2' +
    '&H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|' +
    '&S=|----O-------O---|----O-------O---|' +
    '&K=|o-------o-------|o-------o-------|';

  describe('getQueryVariableFromString', () => {
    it('reads a present variable case-insensitively', () => {
      expect(gu.getQueryVariableFromString('tempo', 80, '?Tempo=120&Div=16')).toBe('120');
    });

    it('returns the default when the variable is absent', () => {
      expect(gu.getQueryVariableFromString('Nope', 'def', '?A=1')).toBe('def');
    });
  });

  describe('getGrooveDataFromUrlString', () => {
    it('parses the top-level groove metadata', () => {
      const gd = gu.getGrooveDataFromUrlString(SAMPLE_URL);
      expect(gd.numberOfMeasures).toBe(2);
      expect(gd.notesPerMeasure).toBe(16);
      expect(gd.timeDivision).toBe(16);
      expect(gd.numBeats).toBe(4);
      expect(gd.noteValue).toBe(4);
      expect(gd.tempo).toBe(80);
      expect(gd.swingPercent).toBe(0);
    });

    it('decodes the drum voices into per-note arrays', () => {
      const gd = gu.getGrooveDataFromUrlString(SAMPLE_URL);
      expect(gd.hh_array).toHaveLength(32); // 16 notes x 2 measures
      expect(gd.snare_array[4]).toBe('!accent!c');
      expect(gd.kick_array[0]).toBe('F');
    });
  });

  describe('URL round trip', () => {
    it('re-encodes parsed data back to the same tab notation', () => {
      const gd = gu.getGrooveDataFromUrlString(SAMPLE_URL);
      const out = gu.getUrlStringFromGrooveData(gd);
      // The voice encodings must survive the round trip verbatim.
      expect(out).toContain('H=|xxxxxxxxxxxxxxxx|xxxxxxxxxxxxxxxx|');
      expect(out).toContain('S=|----O-------O---|----O-------O---|');
      expect(out).toContain('K=|o-------o-------|o-------o-------|');
      expect(out).toContain('TimeSig=4/4');
      expect(out).toContain('Div=16');
      expect(out).toContain('Tempo=80');
      expect(out).toContain('Measures=2');
    });

    it('is stable across a second round trip (parse -> encode -> parse -> encode)', () => {
      const gd1 = gu.getGrooveDataFromUrlString(SAMPLE_URL);
      const out1 = gu.getUrlStringFromGrooveData(gd1);
      const gd2 = gu.getGrooveDataFromUrlString(out1);
      const out2 = gu.getUrlStringFromGrooveData(gd2);
      expect(out2).toBe(out1);
    });
  });
});
