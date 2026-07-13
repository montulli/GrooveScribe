import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';
import {
  getGrooveDataFromUrlString,
  getUrlStringFromGrooveData,
} from '../../js/urlSerialization.js';

// Demonstrates the Step-2/Step-3 extraction: URL <-> grooveData serialization
// now lives in its own PURE module and can be imported directly. It no longer
// takes a GrooveUtils instance — the parser seeds a fresh GrooveData (from
// grooveData.js) and takes instance flags via an optional `config`. GrooveUtils
// delegates its own methods here, so the broader url-serialization*.test.js
// suites exercise this same code.
describe('urlSerialization module (direct import)', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  const URL =
    '?TimeSig=4/4&Div=16&Tempo=90&Measures=1' +
    '&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|';

  it('parses a URL into grooveData', () => {
    const gd = getGrooveDataFromUrlString(URL);
    expect(gd.numBeats).toBe(4);
    expect(gd.noteValue).toBe(4);
    expect(gd.timeDivision).toBe(16);
    expect(gd.hh_array.filter(Boolean)).toHaveLength(16);
  });

  it('serializes grooveData back to a URL string', () => {
    const gd = getGrooveDataFromUrlString(URL);
    const out = getUrlStringFromGrooveData(gd);
    expect(out).toContain('TimeSig=4/4');
    expect(out).toContain('H=|xxxxxxxxxxxxxxxx|');
  });

  it('produces the same result as the delegating GrooveUtils methods', () => {
    const gd = getGrooveDataFromUrlString(URL);
    expect(getUrlStringFromGrooveData(gd)).toBe(gu.getUrlStringFromGrooveData(gd));
  });
});
