import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Deep regression coverage for GrooveUtils' URL <-> grooveData serialization
// (`getGrooveDataFromUrlString` and `getUrlStringFromGrooveData` in
// js/groove_utils.js). This file intentionally goes beyond
// tests/groove_utils/url-serialization.test.js's basic smoke coverage: every
// query parameter the two functions read/write is probed, including default
// fallbacks, boundary clamping, and a couple of undocumented quirks/bugs that
// are part of the app's *current* real behavior (and so must not silently
// change without a test failing).
//
// All expected values below were confirmed by directly running the parser
// against sample inputs before being written into assertions (see PR/task
// notes) -- nothing here is guessed.
describe('GrooveUtils URL serialization (extended)', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('query strings with no leading "?"', () => {
    // getQueryVariableFromString must tolerate a bare "Name=value&..." string
    // (as GrooveDisplay embeds pass, e.g. GrooveEmbedSingle.html) and not eat the
    // first parameter's leading character. With the old substring(1) this parsed
    // "TimeSig=3/4" as "imeSig=3/4", losing it and falling back to the 4/4 default.
    it('parses the first parameter when no "?" prefix is present', () => {
      const gd = gu.getGrooveDataFromUrlString('TimeSig=3/4&Div=8&Measures=1');
      expect(gd.numBeats).toBe(3);
      expect(gd.noteValue).toBe(4);
      expect(gd.timeDivision).toBe(8);
    });

    it('produces the same grooveData with or without the leading "?"', () => {
      const url = 'TimeSig=5/4&Div=16&H=|xxxxxxxxxxxxxxxxxxxx|&K=|o-------o-------o---|';
      expect(gu.getGrooveDataFromUrlString(url)).toEqual(gu.getGrooveDataFromUrlString('?' + url));
    });
  });

  describe('TimeSig parsing', () => {
    it.each([
      ['4/4', 4, 4, 16],
      ['3/4', 3, 4, 12],
      ['6/8', 6, 8, 12],
      ['5/4', 5, 4, 20],
      ['7/8', 7, 8, 14],
    ])('%s -> numBeats=%i noteValue=%i notesPerMeasure=%i (Div=16)', (ts, beats, value, npm) => {
      const gd = gu.getGrooveDataFromUrlString(`?TimeSig=${ts}&Div=16`);
      expect(gd.numBeats).toBe(beats);
      expect(gd.noteValue).toBe(value);
      expect(gd.notesPerMeasure).toBe(npm);
    });

    it('defaults to 4/4 when TimeSig is entirely malformed (no slash)', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=weird&Div=16');
      expect(gd.numBeats).toBe(4);
      expect(gd.noteValue).toBe(4);
    });

    it('defaults each half independently when out of the valid range', () => {
      // top > 32 is invalid -> falls back to 4; bottom must be 2/4/8/16, 3 is invalid -> falls back to 4
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=99/3&Div=16');
      expect(gd.numBeats).toBe(4);
      expect(gd.noteValue).toBe(4);
    });

    it('defaults to 4/4 entirely when TimeSig is absent', () => {
      const gd = gu.getGrooveDataFromUrlString('?Div=16');
      expect(gd.numBeats).toBe(4);
      expect(gd.noteValue).toBe(4);
    });
  });

  describe('Div (timeDivision) parsing', () => {
    it.each([
      [8, 8],
      [12, 12],
      [16, 16],
      [24, 24],
      [32, 32],
      [48, 48],
    ])('Div=%i -> timeDivision=%i, notesPerMeasure scales with time sig', (div, expected) => {
      const gd44 = gu.getGrooveDataFromUrlString(`?TimeSig=4/4&Div=${div}`);
      expect(gd44.timeDivision).toBe(expected);
      expect(gd44.notesPerMeasure).toBe((div / 4) * 4); // calc_notes_per_measure: (div/noteValue)*numBeats

      const gd68 = gu.getGrooveDataFromUrlString(`?TimeSig=6/8&Div=${div}`);
      expect(gd68.timeDivision).toBe(expected);
      expect(gd68.notesPerMeasure).toBe((div / 8) * 6);
    });

    it('defaults Div to 16 when absent', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4');
      expect(gd.timeDivision).toBe(16);
      expect(gd.notesPerMeasure).toBe(16);
    });

    // Current behavior: unlike Measures/Tempo/Swing, Div has NO NaN guard --
    // a non-numeric Div poisons timeDivision and notesPerMeasure with NaN,
    // which in turn makes noteArraysFromURLData build a zero-length array
    // (a `for (i=0; i<NaN; i++)` loop never executes). This documents the
    // current (buggy but real) behavior.
    it('propagates NaN when Div is non-numeric (no fallback default)', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=abc&H=|xxxxxxxxxxxxxxxx|');
      expect(gd.timeDivision).toBeNaN();
      expect(gd.notesPerMeasure).toBeNaN();
      expect(gd.hh_array).toEqual([]);
    });
  });

  describe('Measures (numberOfMeasures) parsing and clamping', () => {
    it.each([
      [1, 1],
      [2, 2],
      [3, 3],
    ])(
      'Measures=%i -> numberOfMeasures=%i, arrays sized notesPerMeasure*measures',
      (m, expected) => {
        const gd = gu.getGrooveDataFromUrlString(`?TimeSig=4/4&Div=16&Measures=${m}`);
        expect(gd.numberOfMeasures).toBe(expected);
        expect(gd.hh_array).toHaveLength(16 * expected);
        expect(gd.snare_array).toHaveLength(16 * expected);
        expect(gd.kick_array).toHaveLength(16 * expected);
        expect(gd.sticking_array).toHaveLength(16 * expected);
        expect(gd.toms_array[0]).toHaveLength(16 * expected);
      }
    );

    it('clamps zero, negative, and non-numeric values up to the minimum of 1', () => {
      for (const bad of [0, -1, 'abc']) {
        const gd = gu.getGrooveDataFromUrlString(`?TimeSig=4/4&Div=16&Measures=${bad}`);
        expect(gd.numberOfMeasures).toBe(1);
      }
    });

    it('clamps values above constant_MAX_MEASURES (10) down to 10', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&Measures=999');
      expect(gd.numberOfMeasures).toBe(10);
      expect(gd.hh_array).toHaveLength(160);
    });

    it('defaults to 1 measure when the param is absent', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.numberOfMeasures).toBe(1);
    });
  });

  describe('Swing parsing and clamping', () => {
    it.each([
      [-5, 0], // below 0 -> falls back to default 0
      [0, 0],
      [33, 33],
      [100, 100], // boundary: valid
      [150, 0], // above 100 -> falls back to default 0
    ])('Swing=%i -> swingPercent=%i', (input, expected) => {
      const gd = gu.getGrooveDataFromUrlString(`?Swing=${input}`);
      expect(gd.swingPercent).toBe(expected);
    });

    it('defaults swingPercent to 0 for non-numeric input or when absent', () => {
      expect(gu.getGrooveDataFromUrlString('?Swing=xx').swingPercent).toBe(0);
      expect(gu.getGrooveDataFromUrlString('?').swingPercent).toBe(0);
    });

    it('is only written to the URL when greater than 0', () => {
      const zero = gu.getGrooveDataFromUrlString('?Swing=0');
      expect(gu.getUrlStringFromGrooveData(zero)).not.toContain('Swing=');

      const nonzero = gu.getGrooveDataFromUrlString('?Swing=42');
      expect(gu.getUrlStringFromGrooveData(nonzero)).toContain('Swing=42');
    });
  });

  describe('Tempo parsing and clamping', () => {
    it.each([
      [10, 80], // below 20 -> falls back to default 80
      [20, 20], // boundary: valid
      [80, 80],
      [400, 400], // boundary: valid
      [500, 80], // above 400 -> falls back to default 80
    ])('Tempo=%i -> tempo=%i', (input, expected) => {
      const gd = gu.getGrooveDataFromUrlString(`?Tempo=${input}`);
      expect(gd.tempo).toBe(expected);
    });

    it('defaults to 80 (constant_DEFAULT_TEMPO) for non-numeric input or when absent', () => {
      expect(gu.getGrooveDataFromUrlString('?Tempo=xx').tempo).toBe(80);
      expect(gu.getGrooveDataFromUrlString('?').tempo).toBe(80);
    });

    it('is always written to the URL, even at the default', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      expect(gu.getUrlStringFromGrooveData(gd)).toContain('Tempo=80');
    });
  });

  describe('MetronomeFreq parsing', () => {
    it('parses a nonzero metronome frequency', () => {
      const gd = gu.getGrooveDataFromUrlString('?MetronomeFreq=8');
      expect(gd.metronomeFrequency).toBe(8);
    });

    it('defaults to 0 when absent', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      expect(gd.metronomeFrequency).toBe(0);
    });

    it('is only written to the URL when non-zero', () => {
      const gd0 = gu.getGrooveDataFromUrlString('?');
      expect(gu.getUrlStringFromGrooveData(gd0)).not.toContain('MetronomeFreq');

      const gd8 = gu.getGrooveDataFromUrlString('?MetronomeFreq=8');
      expect(gu.getUrlStringFromGrooveData(gd8)).toContain('MetronomeFreq=8');
    });
  });

  describe('Stickings voice', () => {
    it('parses a provided Stickings string and flags showStickings true', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&Stickings=|RLRLRLRLRLRLRLRL|');
      expect(gd.showStickings).toBe(true);
      // R/L decode to accented sticking ABC notation
      expect(gd.sticking_array[0]).toBe('"R"x');
      expect(gd.sticking_array[1]).toBe('"L"x');
      expect(gd.sticking_array).toHaveLength(16);
    });

    it('defaults to an all-rest array and showStickings false when absent', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.showStickings).toBe(false);
      expect(gd.sticking_array.every((n) => n === false)).toBe(true);
    });

    it('is only written to the URL when showStickings is true', () => {
      const withSticking = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&Stickings=|RLRLRLRLRLRLRLRL|'
      );
      expect(gu.getUrlStringFromGrooveData(withSticking)).toContain('Stickings=|RLRLRLRLRLRLRLRL|');

      const withoutSticking = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gu.getUrlStringFromGrooveData(withoutSticking)).not.toContain('Stickings=');
    });
  });

  describe('Toms voices (T1-T4)', () => {
    it('parses each of T1..T4 independently and sets showToms when any is present', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&T2=|o---------------|');
      expect(gd.showToms).toBe(true);
      expect(gd.toms_array[1][0]).toBe('d'); // T2 "o" -> constant_ABC_T2_Normal
      // T1/T3/T4 fell back to the default (empty/rest) groove
      expect(gd.toms_array[0].every((n) => n === false)).toBe(true);
      expect(gd.toms_array[2].every((n) => n === false)).toBe(true);
      expect(gd.toms_array[3].every((n) => n === false)).toBe(true);
    });

    it('defaults showToms to false and all-rest arrays when none of T1-T4 are present', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.showToms).toBe(false);
      for (const tom of gd.toms_array) {
        expect(tom.every((n) => n === false)).toBe(true);
      }
    });

    // Quirk: only T1 and T4 are ever re-serialized by getUrlStringFromGrooveData,
    // even if showToms became true because of a T2/T3 param. T2/T3 data is
    // effectively unrecoverable from a round trip today.
    it('re-serializes only T1 and T4, never T2/T3, even when showToms is true', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?TimeSig=4/4&Div=16&T1=|o---------------|&T2=|o---------------|&T3=|o---------------|&T4=|o---------------|'
      );
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out).toContain('T1=|o---------------|');
      expect(out).toContain('T4=|o---------------|');
      expect(out).not.toContain('T2=');
      expect(out).not.toContain('T3=');
    });

    it('is not written to the URL at all when showToms is false', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out).not.toContain('T1=');
      expect(out).not.toContain('T4=');
    });

    it('degrades an unsupported tab character to a rest (false) instead of throwing', () => {
      // "x" is not a valid T2 tablature character (only "o" is; see
      // tablatureToABCNotationPerNote), so it silently becomes `false`
      // (a console.log warning fires, but no exception).
      expect(() => {
        const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&T2=|x---------------|');
        expect(gd.toms_array[1][0]).toBe(false);
      }).not.toThrow();
    });
  });

  describe('Title / Author / Comments', () => {
    it('URL-decodes %XX-escaped text', () => {
      const gd = gu.getGrooveDataFromUrlString(
        '?Title=Jazz%20Shuffle&Author=John%20Bonham&Comments=Nice%20groove%21'
      );
      expect(gd.title).toBe('Jazz Shuffle');
      expect(gd.author).toBe('John Bonham');
      expect(gd.comments).toBe('Nice groove!');
    });

    it('treats literal "+" as a space (classic query-string convention)', () => {
      const gd = gu.getGrooveDataFromUrlString('?Title=Jazz+Shuffle');
      expect(gd.title).toBe('Jazz Shuffle');
    });

    it('defaults all three to empty string when absent', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      expect(gd.title).toBe('');
      expect(gd.author).toBe('');
      expect(gd.comments).toBe('');
    });

    it('round-trips through getUrlStringFromGrooveData with encodeURIComponent', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      gd.title = 'Jazz Shuffle';
      gd.author = 'John Bonham';
      gd.comments = 'Nice groove!';
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out).toContain('Title=Jazz%20Shuffle');
      expect(out).toContain('Author=John%20Bonham');
      // encodeURIComponent deliberately does NOT escape "!" (it's in its
      // allowed set), so it appears literally in the output.
      expect(out).toContain('Comments=Nice%20groove!');
    });

    it('omits Title/Author/Comments from the URL entirely when empty', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out).not.toContain('Title=');
      expect(out).not.toContain('Author=');
      expect(out).not.toContain('Comments=');
    });
  });

  describe('Debug / Mode(viewMode) / GDB_Author flags', () => {
    it('parses Debug=1 into debugMode and re-serializes it', () => {
      const gd = gu.getGrooveDataFromUrlString('?Debug=1');
      expect(gd.debugMode).toBe(1);
      expect(gu.getUrlStringFromGrooveData(gd)).toContain('Debug=1');
    });

    it('omits Debug from the URL when debugMode is falsy (the default)', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      // root.debugMode defaults to `false`, and parseInt(false, 10) is NaN
      // (not 0) -- but NaN is still falsy, so the "if (debugMode)" check in
      // getUrlStringFromGrooveData still omits it from the URL.
      expect(gd.debugMode).toBeNaN();
      expect(gu.getUrlStringFromGrooveData(gd)).not.toContain('Debug=');
    });

    // viewMode is NOT parsed by getGrooveDataFromUrlString at all (it is only
    // ever set elsewhere, e.g. groove_writer.js). Every grooveData object
    // inherits `root.viewMode`'s module-level default of `true` via the
    // grooveDataNew() constructor, so getUrlStringFromGrooveData emits
    // "Mode=view" for essentially every groove produced by this parser.
    it('always writes Mode=view because viewMode defaults to true and is never read from the URL', () => {
      const gd = gu.getGrooveDataFromUrlString('?Mode=edit'); // note: "Mode" is not a recognized input param here
      expect(gd.viewMode).toBe(true);
      expect(gu.getUrlStringFromGrooveData(gd)).toContain('Mode=view');
    });

    it('writes GDB_Author=1 when grooveDBAuthoring is truthy', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      gd.grooveDBAuthoring = true;
      expect(gu.getUrlStringFromGrooveData(gd)).toContain('GDB_Author=1');
    });

    it('omits GDB_Author from the URL by default', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      expect(gd.grooveDBAuthoring).toBe(false);
      expect(gu.getUrlStringFromGrooveData(gd)).not.toContain('GDB_Author');
    });
  });

  describe('showLegend / kickStemsUp are not part of URL serialization', () => {
    it('are never emitted by getUrlStringFromGrooveData regardless of their value', () => {
      const gd = gu.getGrooveDataFromUrlString('?');
      gd.showLegend = true;
      gd.kickStemsUp = false;
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out.toLowerCase()).not.toContain('legend');
      expect(out.toLowerCase()).not.toContain('kickstem');
    });
  });

  describe('only the modern "H" / "K" params are recognized (no "HH" / "B" aliases)', () => {
    // The URL scheme uses the short names H (hi-hat) and K (kick). The long-form
    // legacy aliases HH / B are not supported, so those param names are ignored
    // and the voice falls through to its generated default groove.
    it('does not recognize an "HH" param; falls back to the default hi-hat groove', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&HH=|o---------------|');
      const defaultGd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.hh_array).toEqual(defaultGd.hh_array);
    });

    it('does not recognize a "B" param; falls back to the default kick groove', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&B=|x---------------|');
      const defaultGd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.kick_array).toEqual(defaultGd.kick_array);
    });
  });

  describe('default drum voice generation (no H/S/K/Stickings params)', () => {
    it('defaults H to all hi-hat hits (x -> "^g")', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.hh_array).toEqual(Array(16).fill('^g'));
    });

    it('defaults S to backbeat accents on beats 2 and 4 of a 4/4 groove', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.snare_array[4]).toBe('!accent!c');
      expect(gd.snare_array[12]).toBe('!accent!c');
      expect(gd.snare_array.filter((n) => n !== false)).toHaveLength(2);
    });

    it('defaults K to hits on beats 1 and 3 of a 4/4 groove', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      expect(gd.kick_array[0]).toBe('F');
      expect(gd.kick_array[8]).toBe('F');
      expect(gd.kick_array.filter((n) => n !== false)).toHaveLength(2);
    });

    // Special case in GetDefaultHHGroove: a 48-note board (triplet feel) gets
    // an all-rest default hi-hat instead of all-hits.
    it('defaults H to all rests for a 48-note (triplet) board', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=48');
      expect(gd.hh_array.every((n) => n === false)).toBe(true);
    });
  });

  describe('noteArraysFromURLData scaling (mismatched note-string length vs. board size)', () => {
    it('scales a longer note string down onto a smaller board (>=2x ratio)', () => {
      // Div=8 on 4/4 -> notesPerMeasure = 8, but the H string has 16 chars.
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=8&H=|x-x-x-x-x-x-x-x-|');
      expect(gd.notesPerMeasure).toBe(8);
      expect(gd.hh_array).toEqual(Array(8).fill('^g'));
    });

    it('scales a shorter note string up onto a larger board (>=2x ratio)', () => {
      // Div=16 on 4/4 -> notesPerMeasure = 16, but the H string has 8 chars.
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16&H=|xxxxxxxx|');
      expect(gd.notesPerMeasure).toBe(16);
      expect(gd.hh_array).toHaveLength(16);
      // Every other slot gets a hit, the rest are left as the false (rest) initializer.
      expect(gd.hh_array).toEqual([
        '^g',
        false,
        '^g',
        false,
        '^g',
        false,
        '^g',
        false,
        '^g',
        false,
        '^g',
        false,
        '^g',
        false,
        '^g',
        false,
      ]);
    });
  });

  describe('getUrlStringFromGrooveData destination argument', () => {
    it('with no destination, builds a URL against the current page (no path change)', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(
        out.startsWith(
          window.location.protocol + '//' + window.location.host + window.location.pathname + '?'
        )
      ).toBe(true);
    });

    it('"display" appends GrooveEmbed.html to the path (jsdom pathname has neither index.html nor /gscribe)', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      const out = gu.getUrlStringFromGrooveData(gd, 'display');
      expect(out).toContain('GrooveEmbed.html?');
    });

    it('"fullGrooveScribe" replaces the whole origin+path with the hardcoded external URL', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      const out = gu.getUrlStringFromGrooveData(gd, 'fullGrooveScribe');
      expect(out.startsWith('https://www.mikeslessons.com/gscribe?')).toBe(true);
    });

    it('an unrecognized destination string falls through unchanged, same as no destination', () => {
      const gd = gu.getGrooveDataFromUrlString('?TimeSig=4/4&Div=16');
      const withNone = gu.getUrlStringFromGrooveData(gd);
      const withRandom = gu.getUrlStringFromGrooveData(gd, 'some-unknown-value');
      expect(withRandom).toBe(withNone);
    });
  });

  describe('getQueryVariableFromString edge behavior relied on by both functions', () => {
    it('tolerates a query string with or without a leading "?"', () => {
      // The '?' is stripped only when present, so the first parameter's name is
      // preserved either way (GrooveDisplay embeds pass a bare "Name=value&...").
      expect(gu.getQueryVariableFromString('tempo', 'def', 'Tempo=99')).toBe('99');
      expect(gu.getQueryVariableFromString('tempo', 'def', '?Tempo=99')).toBe('99');
    });

    it('returns the default for a variable that is not present', () => {
      expect(gu.getQueryVariableFromString('missing', 'def', '?Tempo=99')).toBe('def');
      expect(gu.getQueryVariableFromString('missing', 'def', 'Tempo=99')).toBe('def');
    });
  });

  describe('full round trips: parse -> encode -> parse -> encode must be stable', () => {
    const grooves = [
      {
        name: '3/4 triplet-division groove with tempo/measures',
        url: '?TimeSig=3/4&Div=12&Measures=1&Tempo=140&H=|x-xx-xx-xx-x|&S=|----O-------|&K=|o-----------|',
      },
      {
        name: '6/8 two-measure groove with title and swing',
        url:
          '?TimeSig=6/8&Div=24&Measures=2&Tempo=200&Swing=62&Title=Shuffle' +
          '&H=|x-xx-xx-xx-xx-xx-xx-xx-x|x-xx-xx-xx-xx-xx-xx-xx-x|' +
          '&S=|------O-----------------|------O-----------------|' +
          '&K=|o-----------------------|o-----------------------|',
      },
      {
        name: '5/4 groove with stickings shown',
        url:
          '?TimeSig=5/4&Div=16&Measures=1&Stickings=|RLRLRLRLRLRLRLRL|' +
          '&H=|xxxxxxxxxxxxxxxxxxxx|&S=|----O-------O-------|&K=|o-------o-------o---|',
      },
    ];

    it.each(grooves.map((g) => [g.name, g.url]))(
      '%s stays byte-identical after a second round trip',
      (_name, url) => {
        const gd1 = gu.getGrooveDataFromUrlString(url);
        const out1 = gu.getUrlStringFromGrooveData(gd1);
        const gd2 = gu.getGrooveDataFromUrlString(out1);
        const out2 = gu.getUrlStringFromGrooveData(gd2);
        expect(out2).toBe(out1);
      }
    );

    it('preserves the H=/S=/K= tab notation verbatim through a round trip', () => {
      const url =
        '?TimeSig=4/4&Div=16&Measures=1' +
        '&H=|x-x-x-x-x-x-x-x-|&S=|----O-------O---|&K=|o-------o-------|';
      const gd = gu.getGrooveDataFromUrlString(url);
      const out = gu.getUrlStringFromGrooveData(gd);
      expect(out).toContain('H=|x-x-x-x-x-x-x-x-|');
      expect(out).toContain('S=|----O-------O---|');
      expect(out).toContain('K=|o-------o-------|');
    });
  });
});
