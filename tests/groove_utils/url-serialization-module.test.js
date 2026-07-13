import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';
import {
  getGrooveDataFromUrlString,
  getUrlStringFromGrooveData,
} from '../../js/urlSerialization.js';

// Demonstrates the Step-2 extraction: URL <-> grooveData serialization now lives
// in its own module and can be imported directly. The functions still take a
// GrooveUtils instance for the note/tab helper methods they rely on (a later
// step can extract those too); GrooveUtils delegates its own methods here, so
// the broader url-serialization*.test.js suites exercise this same code.
describe('urlSerialization module (direct import)', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  const URL =
    '?TimeSig=4/4&Div=16&Tempo=90&Measures=1' +
    '&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|';

  it('parses a URL into grooveData', () => {
    const gd = getGrooveDataFromUrlString(gu, URL);
    expect(gd.numBeats).toBe(4);
    expect(gd.noteValue).toBe(4);
    expect(gd.timeDivision).toBe(16);
    expect(gd.hh_array.filter(Boolean)).toHaveLength(16);
  });

  it('serializes grooveData back to a URL string', () => {
    const gd = getGrooveDataFromUrlString(gu, URL);
    const out = getUrlStringFromGrooveData(gu, gd);
    expect(out).toContain('TimeSig=4/4');
    expect(out).toContain('H=|xxxxxxxxxxxxxxxx|');
  });

  it('produces the same result as the delegating GrooveUtils methods', () => {
    const gd = getGrooveDataFromUrlString(gu, URL);
    expect(getUrlStringFromGrooveData(gu, gd)).toBe(gu.getUrlStringFromGrooveData(gd));
  });
});
