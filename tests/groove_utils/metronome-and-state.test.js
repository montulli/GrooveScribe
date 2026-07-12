import { describe, it, expect, beforeEach } from 'vitest';
import { newGrooveUtils } from '../helpers/legacyLoader.js';

// Regression coverage for grooveData defaults, metronome offset/rotation state,
// triplet-division detection, and sticking-count conversion helpers in
// groove_utils.js. Behavior below was verified by probing a live instance in
// jsdom before writing assertions (see task instructions) -- nothing here is
// assumed.
describe('GrooveUtils metronome & state helpers', () => {
  let gu;
  beforeEach(async () => {
    gu = await newGrooveUtils();
  });

  describe('grooveDataNew', () => {
    it('produces the documented default field values on a fresh instance', () => {
      const gd = new gu.grooveDataNew();

      expect(gd.notesPerMeasure).toBe(16);
      expect(gd.timeDivision).toBe(16);
      expect(gd.numberOfMeasures).toBe(1);
      expect(gd.numBeats).toBe(4);
      expect(gd.noteValue).toBe(4);
      expect(gd.showToms).toBe(false);
      expect(gd.showStickings).toBe(false);
      expect(gd.title).toBe('');
      expect(gd.author).toBe('');
      expect(gd.comments).toBe('');
      expect(gd.showLegend).toBe(false);
      expect(gd.swingPercent).toBe(0);
      expect(gd.tempo).toBe(80); // constant_DEFAULT_TEMPO
      expect(gd.kickStemsUp).toBe(true);
      expect(gd.metronomeFrequency).toBe(0);
      expect(gd.debugMode).toBe(false);
      expect(gd.grooveDBAuthoring).toBe(false);
      expect(gd.viewMode).toBe(true);
    });

    it('gives each note array 32 entries, all false, and 4 tom arrays', () => {
      const gd = new gu.grooveDataNew();

      expect(gd.sticking_array).toHaveLength(32);
      expect(gd.hh_array).toHaveLength(32);
      expect(gd.snare_array).toHaveLength(32);
      expect(gd.kick_array).toHaveLength(32);
      expect(gd.sticking_array.every((v) => v === false)).toBe(true);
      expect(gd.hh_array.every((v) => v === false)).toBe(true);
      expect(gd.snare_array.every((v) => v === false)).toBe(true);
      expect(gd.kick_array.every((v) => v === false)).toBe(true);

      expect(gd.toms_array).toHaveLength(4);
      gd.toms_array.forEach((tomArray) => {
        expect(tomArray).toHaveLength(32);
        expect(tomArray.every((v) => v === false)).toBe(true);
      });
    });

    it('gives each instance its own array copies (no shared references)', () => {
      const gd1 = new gu.grooveDataNew();
      const gd2 = new gu.grooveDataNew();

      gd1.hh_array[0] = true;
      gd1.toms_array[0][0] = true;

      expect(gd2.hh_array[0]).toBe(false);
      expect(gd2.toms_array[0][0]).toBe(false);
    });
  });

  describe('getMetronomeSolo / setMetronomeSolo', () => {
    it('defaults to false and round-trips true/false', () => {
      expect(gu.getMetronomeSolo()).toBe(false);

      gu.setMetronomeSolo(true);
      expect(gu.getMetronomeSolo()).toBe(true);

      gu.setMetronomeSolo(false);
      expect(gu.getMetronomeSolo()).toBe(false);
    });
  });

  describe('getMetronomeOffsetClickStart / setMetronomeOffsetClickStart', () => {
    it('defaults to "1" and round-trips arbitrary values', () => {
      expect(gu.getMetronomeOffsetClickStart()).toBe('1');

      gu.setMetronomeOffsetClickStart('E');
      expect(gu.getMetronomeOffsetClickStart()).toBe('E');
    });
  });

  describe('getMetronomeOffsetClickStartIsRotating', () => {
    it('is false by default and true only when set to the literal string ROTATE', () => {
      expect(gu.getMetronomeOffsetClickStartIsRotating()).toBe(false);

      gu.setMetronomeOffsetClickStart('AND');
      expect(gu.getMetronomeOffsetClickStartIsRotating()).toBe(false);

      gu.setMetronomeOffsetClickStart('ROTATE');
      expect(gu.getMetronomeOffsetClickStartIsRotating()).toBe(true);
    });
  });

  describe('advanceMetronomeOptionsOffsetClickStartRotation', () => {
    it('returns false and does not advance when rotation is not enabled', () => {
      // default state ("1") is not rotating
      expect(gu.advanceMetronomeOptionsOffsetClickStartRotation(false)).toBe(false);
      expect(gu.getMetronomeOptionsOffsetClickStartRotation(false)).toBe('1');
    });

    it('returns true and advances the internal counter when rotation is enabled', () => {
      gu.setMetronomeOffsetClickStart('ROTATE');
      gu.resetMetronomeOptionsOffsetClickStartRotation();

      expect(gu.advanceMetronomeOptionsOffsetClickStartRotation(false)).toBe(true);
    });
  });

  describe('getMetronomeOptionsOffsetClickStartRotation', () => {
    it('returns the raw offset value unchanged when rotation is not enabled', () => {
      gu.setMetronomeOffsetClickStart('AND');
      expect(gu.getMetronomeOptionsOffsetClickStartRotation(false)).toBe('AND');
      expect(gu.getMetronomeOptionsOffsetClickStartRotation(true)).toBe('AND');
    });

    it('cycles 1 -> E -> AND -> A -> 1 ... for straight (non-triplet) rotation', () => {
      gu.setMetronomeOffsetClickStart('ROTATE');
      gu.resetMetronomeOptionsOffsetClickStartRotation();

      const sequence = [];
      for (let i = 0; i < 6; i++) {
        gu.advanceMetronomeOptionsOffsetClickStartRotation(false);
        sequence.push(gu.getMetronomeOptionsOffsetClickStartRotation(false));
      }

      expect(sequence).toEqual(['E', 'AND', 'A', '1', 'E', 'AND']);
    });

    it('cycles 1 -> TI -> TA -> 1 ... for triplet rotation (only 3 states)', () => {
      gu.setMetronomeOffsetClickStart('ROTATE');
      gu.resetMetronomeOptionsOffsetClickStartRotation();

      const sequence = [];
      for (let i = 0; i < 6; i++) {
        gu.advanceMetronomeOptionsOffsetClickStartRotation(true);
        sequence.push(gu.getMetronomeOptionsOffsetClickStartRotation(true));
      }

      expect(sequence).toEqual(['TI', 'TA', '1', 'TI', 'TA', '1']);
    });
  });

  describe('resetMetronomeOptionsOffsetClickStartRotation', () => {
    it('resets the rotation counter back to the "1" position', () => {
      gu.setMetronomeOffsetClickStart('ROTATE');
      gu.advanceMetronomeOptionsOffsetClickStartRotation(false);
      gu.advanceMetronomeOptionsOffsetClickStartRotation(false);
      expect(gu.getMetronomeOptionsOffsetClickStartRotation(false)).toBe('AND');

      gu.resetMetronomeOptionsOffsetClickStartRotation();
      expect(gu.getMetronomeOptionsOffsetClickStartRotation(false)).toBe('1');
    });
  });

  describe('isTripletDivisionFromNotesPerMeasure', () => {
    it('detects triplet divisions (implied division divisible by 12) in 4/4', () => {
      expect(gu.isTripletDivisionFromNotesPerMeasure(16, 4, 4)).toBe(false); // division 16
      expect(gu.isTripletDivisionFromNotesPerMeasure(12, 4, 4)).toBe(true);  // division 12
      expect(gu.isTripletDivisionFromNotesPerMeasure(24, 4, 4)).toBe(true);  // division 24
    });

    it('accounts for the time signature when deriving the implied division', () => {
      // 9 notes / 6 top * 8 bottom = division 12 -> triplet
      expect(gu.isTripletDivisionFromNotesPerMeasure(9, 6, 8)).toBe(true);
      // 12 notes / 6 top * 8 bottom = division 16 -> not a triplet
      expect(gu.isTripletDivisionFromNotesPerMeasure(12, 6, 8)).toBe(false);
    });
  });

  describe('figure_out_sticking_count_for_index', () => {
    it('labels a 16/4/4 measure as 1,e,&,a groups per beat', () => {
      const expected = [
        1, 'e', '&', 'a',
        2, 'e', '&', 'a',
        3, 'e', '&', 'a',
        4, 'e', '&', 'a',
      ];
      const actual = expected.map((_, i) => gu.figure_out_sticking_count_for_index(i, 16, 16, 4));
      expect(actual).toEqual(expected);
    });

    it('labels a 12/4/4 (8th-note triplet) measure as 1,&,a groups per beat', () => {
      const expected = [
        1, '&', 'a',
        2, '&', 'a',
        3, '&', 'a',
        4, '&', 'a',
      ];
      const actual = expected.map((_, i) => gu.figure_out_sticking_count_for_index(i, 12, 12, 4));
      expect(actual).toEqual(expected);
    });

    it('wraps the note index using notes_per_measure (index % notes_per_measure)', () => {
      // index 16 in a 16-note measure wraps back to note_index 0 -> count "1"
      expect(gu.figure_out_sticking_count_for_index(16, 16, 16, 4)).toBe(1);
    });
  });

  describe('convert_sticking_counts_to_actual_counts', () => {
    // The function mutates any array slot equal to the ABC_STICK_COUNT sentinel
    // ('"count"x') in-place, replacing it with a quoted count string like '"1"x'.
    // Untouched slots (false) are left alone.
    it('converts count-sentinel entries in a 32-slot (straight, 16th) array', () => {
      const sticking = new Array(32).fill(false);
      sticking[0] = '"count"x'; // note 0 -> "1"
      sticking[2] = '"count"x'; // note 2 (of 4 per full-size beat) -> "e"
      sticking[4] = '"count"x'; // note 4 -> "&"
      sticking[8] = '"count"x'; // note 8 -> "2"

      gu.convert_sticking_counts_to_actual_counts(sticking, 16, 4, 4);

      expect(sticking[0]).toBe('"1"x');
      expect(sticking[2]).toBe('"e"x');
      expect(sticking[4]).toBe('"&"x');
      expect(sticking[8]).toBe('"2"x');
      // Untouched slots remain false
      expect(sticking[1]).toBe(false);
      expect(sticking[3]).toBe(false);
    });

    it('converts count-sentinel entries in a 48-slot (triplet, 8th-triplet) array', () => {
      const sticking = new Array(48).fill(false);
      sticking[0] = '"count"x'; // -> "1"
      sticking[1] = '"count"x'; // -> "1" (same triplet-eighth group as index 0 after scaling)
      sticking[3] = '"count"x'; // -> "1"
      sticking[6] = '"count"x'; // -> "&"

      gu.convert_sticking_counts_to_actual_counts(sticking, 12, 4, 4);

      expect(sticking[0]).toBe('"1"x');
      expect(sticking[1]).toBe('"1"x');
      expect(sticking[3]).toBe('"1"x');
      expect(sticking[6]).toBe('"&"x');
      expect(sticking[2]).toBe(false);
    });
  });

  describe('is_touch_device', () => {
    // In this project's jsdom test environment, 'ontouchstart' is present on
    // window, so is_touch_device() evaluates true (mirrors touch-capable browsers).
    it('returns true under the jsdom test environment', () => {
      expect(gu.is_touch_device()).toBe(true);
    });
  });

  describe('getBrowserInfo', () => {
    it('parses navigator info under jsdom into browser/version/platform/uastring', () => {
      const info = gu.getBrowserInfo();

      // jsdom reports navigator.appName as "Netscape" with a Mozilla/5.0 UA
      // string that matches none of the Chrome/Firefox/Safari/Edge branches,
      // so browser/version pass through unmodified and platform falls back
      // to "windows".
      expect(info.browser).toBe('Netscape');
      expect(info.platform).toBe('windows');
      expect(typeof info.uastring).toBe('string');
      expect(info.uastring).toContain('jsdom');
      expect(info.version).toBe(4); // parseFloat of jsdom's appVersion string
    });
  });

  describe('doesDivisionSupportSwing', () => {
    it('disallows swing for triplet divisions and quarter-note division 4', () => {
      expect(gu.doesDivisionSupportSwing(4)).toBe(false);
      expect(gu.doesDivisionSupportSwing(12)).toBe(false);
      expect(gu.doesDivisionSupportSwing(24)).toBe(false);
    });

    it('allows swing for straight 8th/16th/32nd divisions', () => {
      expect(gu.doesDivisionSupportSwing(8)).toBe(true);
      expect(gu.doesDivisionSupportSwing(16)).toBe(true);
      expect(gu.doesDivisionSupportSwing(32)).toBe(true);
    });
  });
});
